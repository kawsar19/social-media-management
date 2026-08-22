import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/db";
import AutoPost from "@/lib/models/AutoPost";
import Post from "@/lib/models/Post";
import { writePost } from "@/lib/ai/writePost";
import { isDue } from "@/lib/autopost/schedule";
import { runQueue } from "@/lib/autopost/queue";

// GET/POST /api/cron
// Auth: `Authorization: Bearer <CRON_SECRET>` (or ?key= for callers that can't
// set headers). No user session — this is called by a scheduler, not a browser.
//
// Two jobs run on every tick:
//
//   1. Autopilot — walks every enabled AutoPost, generates fresh content for the
//      ones whose scheduled moment has arrived, and publishes it.
//   2. Queue — publishes already-written Posts that were scheduled for a
//      specific date and time (status "scheduled", see lib/autopost/queue.ts).
//
// Safe to call as often as you like. An autopilot occurrence that has already
// run is skipped by its runKey, and a queued post is claimed by an atomic
// status change, so extra ticks are no-ops rather than duplicate posts.
//
// Driven by .github/workflows/autopost-cron.yml (every 15 minutes) — Vercel's
// own cron is limited to once a day on the free plan, which can't honour a
// user-chosen time of day.

// Generation + publishing for several automations, sequentially. Each one costs
// an AI call plus a publish round-trip per target, so this needs room; it is
// still bounded by MAX_PER_RUN below. 299 rather than 300 because Vercel's
// hobby plan rejects 300 at build time despite documenting a 1-300 range.
export const maxDuration = 299;

// Ceiling on automations handled per tick. Prevents one run from walking off
// the end of maxDuration and being killed mid-publish, which would leave a post
// published but unrecorded — and therefore published again on the next tick.
// Anything not reached stays due and is picked up 15 minutes later, well inside
// the grace window.
const MAX_PER_RUN = 8;

// Ceiling on queued posts published per tick, budgeted separately from the
// automations above so a long autopilot backlog can't starve the queue (or the
// other way round). Queued posts are cheaper — no AI call, just the publish —
// but a video target can still consume most of a run, hence the modest number.
const MAX_QUEUE_PER_RUN = 10;

// How many past runs to keep per automation. This is the history strip in the
// UI, not an audit log.
const RUN_HISTORY_LIMIT = 20;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a configured secret the endpoint would be an open "publish now"
  // trigger for anyone who finds the URL, so it stays shut instead.
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return timingSafeEqual(header.slice("Bearer ".length), secret);
  }
  const key = new URL(request.url).searchParams.get("key");
  return key ? timingSafeEqual(key, secret) : false;
}

// Constant-time compare so a wrong secret can't be recovered byte by byte from
// response timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The publish route authenticates as a user, but a cron run has no session. We
// mint a short-lived token for the automation's owner using the same secret the
// login flow signs with, so the existing, tested publish pipeline is reused
// as-is rather than duplicated with a service-account path through it.
function mintUserToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "10m" });
}

type RunOutcome = {
  autoPostId: string;
  name: string;
  status: "published" | "partial" | "failed" | "skipped";
  postId?: string;
  error?: string;
};

async function runOne(auto: any, runKey: string, origin: string): Promise<RunOutcome> {
  const base = { autoPostId: String(auto._id), name: auto.name };

  // Claim the occurrence BEFORE doing any work. If generation or publishing
  // throws — or the function is killed partway through — the key is already
  // stored, so the next tick won't retry and risk double-posting. The tradeoff
  // is deliberate: for a public post, silently skipping a day is recoverable,
  // publishing twice is not.
  auto.lastRunKey = runKey;
  auto.lastRunAt = new Date();
  await auto.save();

  let content: string;
  try {
    content = await writePost(auto.prompt, {
      language: auto.language,
      tone: auto.tone,
      length: auto.length,
      platforms: [...new Set(auto.targets.map((t: any) => t.platform))] as string[],
      hashtags: auto.hashtags,
      emojis: auto.emojis,
      unattended: true,
    });
  } catch (err: any) {
    const outcome: RunOutcome = {
      ...base,
      status: "failed",
      error: `generation_failed: ${err?.message || "unknown"}`,
    };
    await recordRun(auto, outcome, "");
    return outcome;
  }

  // A real Post, so an auto-published post is indistinguishable from a manual
  // one everywhere else in the app — Saved Posts, permalinks, insights.
  const post = await Post.create({
    userId: auto.userId,
    content,
    status: "draft",
    targets: auto.targets.map((t: any) => ({
      platform: t.platform,
      accountId: t.accountId,
      accountName: t.accountName,
      destinationId: t.destinationId,
      destinationName: t.destinationName,
      status: "pending",
    })),
  });

  try {
    const res = await fetch(`${origin}/api/posts/${post._id}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mintUserToken(String(auto.userId))}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const outcome: RunOutcome = {
        ...base,
        status: "failed",
        postId: String(post._id),
        error: data?.error || `publish_failed_${res.status}`,
      };
      await recordRun(auto, outcome, content);
      return outcome;
    }

    // The publish route has already rolled the per-target results up into the
    // post's own status, so read it back rather than recomputing.
    const status =
      data?.post?.status === "published"
        ? "published"
        : data?.post?.status === "partial"
          ? "partial"
          : "failed";

    const failed = (data?.post?.targets || []).filter((t: any) => t.status === "failed");
    const outcome: RunOutcome = {
      ...base,
      status,
      postId: String(post._id),
      ...(failed.length > 0
        ? { error: failed.map((t: any) => `${t.platform}: ${t.error}`).join("; ") }
        : {}),
    };
    await recordRun(auto, outcome, content);
    return outcome;
  } catch (err: any) {
    const outcome: RunOutcome = {
      ...base,
      status: "failed",
      postId: String(post._id),
      error: `publish_threw: ${err?.message || "unknown"}`,
    };
    await recordRun(auto, outcome, content);
    return outcome;
  }
}

async function recordRun(auto: any, outcome: RunOutcome, content: string) {
  auto.runs.unshift({
    runAt: new Date(),
    status: outcome.status,
    postId: outcome.postId,
    excerpt: content.slice(0, 200),
    error: outcome.error,
  });
  if (auto.runs.length > RUN_HISTORY_LIMIT) {
    auto.runs = auto.runs.slice(0, RUN_HISTORY_LIMIT);
  }
  await auto.save();
}

async function handle(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
  } catch {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  // One instant for the whole run, so every automation is judged against the
  // same clock regardless of how long the run takes.
  const now = new Date();
  const origin = new URL(request.url).origin;

  const candidates = await AutoPost.find({ enabled: true });

  const due: { auto: any; runKey: string }[] = [];
  for (const auto of candidates) {
    const check = isDue(auto, now);
    if (check.due) due.push({ auto, runKey: check.runKey });
  }

  const slice = due.slice(0, MAX_PER_RUN);
  const results: RunOutcome[] = [];
  for (const { auto, runKey } of slice) {
    results.push(await runOne(auto, runKey, origin));
  }

  // Queued posts run after the automations. They're the cheaper job, so if this
  // tick is going to run out of time it should be the automations — which cost
  // an AI call each — that got the budget. Anything left stays scheduled and is
  // picked up next tick, well inside the grace window.
  const queue = await runQueue(now, origin, mintUserToken, MAX_QUEUE_PER_RUN);

  return NextResponse.json({
    autopilot: {
      checked: candidates.length,
      due: due.length,
      // Surfaced rather than silently dropped: if this is ever non-zero the tick
      // hit its ceiling and the rest are waiting on the next one.
      deferred: Math.max(0, due.length - slice.length),
      ran: results.length,
      results,
    },
    queue,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
