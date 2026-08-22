// Deciding whether a scheduled Post is due, and firing the ones that are.
//
// This is the sibling of schedule.ts. The distinction matters:
//
//   AutoPost  — a standing instruction ("every day at 9, write something about
//               X"). Recurring, so "which occurrence is this?" needs a runKey,
//               and the content doesn't exist until the run happens.
//   Post      — one already-written piece of content with one scheduledAt. It
//               fires exactly once and then stops being scheduled, so the
//               status transition itself is the de-duplication guard.
//
// A queue post therefore needs no runKey: claiming it is a conditional status
// update from "scheduled" to "publishing", which only one caller can win.

import Post from "@/lib/models/Post";

// How late a scheduled post may still go out. Matched to GRACE_MINUTES in
// schedule.ts on purpose — both are absorbing the same erratic cron, and two
// different answers to "how late is too late?" in one app would be a trap.
//
// Beyond this the post is marked failed rather than published hours off
// schedule: for a queue built around specific dates and times, a post landing
// on the wrong day is worse than one that visibly didn't go.
export const QUEUE_GRACE_MINUTES = 180;

export type QueueDueCheck =
  | { due: true }
  | { due: false; reason: "not_yet" | "missed_window" | "no_targets" };

type QueuePost = {
  scheduledAt?: Date | null;
  targets?: unknown[];
};

// Should this scheduled post publish on this cron tick?
//
// Unlike the AutoPost check this needs no timezone handling: scheduledAt is a
// real instant, chosen in the browser's zone and stored as UTC, so comparing it
// against `now` is already a like-for-like comparison.
export function isQueueDue(post: QueuePost, now: Date): QueueDueCheck {
  if (!post.targets?.length) return { due: false, reason: "no_targets" };
  if (!post.scheduledAt) return { due: false, reason: "not_yet" };

  const lateByMinutes = (now.getTime() - new Date(post.scheduledAt).getTime()) / 60_000;
  if (lateByMinutes < 0) return { due: false, reason: "not_yet" };
  if (lateByMinutes > QUEUE_GRACE_MINUTES) return { due: false, reason: "missed_window" };

  return { due: true };
}

export type QueueOutcome = {
  postId: string;
  status: "published" | "partial" | "failed" | "expired";
  error?: string;
};

// Claim one scheduled post so no other tick can publish it.
//
// The guard is the `status: "scheduled"` in the filter: two overlapping cron
// runs both see the post as due, but only one findOneAndUpdate matches, and the
// loser gets null. That makes the claim atomic in the database rather than
// relying on the ticks not overlapping — which the concurrency group in the
// workflow encourages but cannot guarantee (a manual dispatch, a retried run,
// or a second deployment all sidestep it).
async function claim(postId: string): Promise<boolean> {
  const claimed = await Post.findOneAndUpdate(
    { _id: postId, status: "scheduled" },
    { $set: { status: "publishing" } }
  );
  return claimed !== null;
}

// Publish one due post through the normal publish route.
//
// Reusing /api/posts/[id]/publish rather than reimplementing it is the whole
// point: token resolution, per-platform quirks, Facebook's multi-Page batching,
// permalink derivation, and R2 cleanup all live there and are already tested.
// The cron authenticates as the post's owner with a short-lived token, exactly
// as the AutoPost path does.
async function publishOne(
  post: any,
  origin: string,
  mintUserToken: (userId: string) => string
): Promise<QueueOutcome> {
  const postId = String(post._id);

  if (!(await claim(postId))) {
    // Another tick got there first. Not an error — just nothing left to do.
    return { postId, status: "expired", error: "already_claimed" };
  }

  try {
    const res = await fetch(`${origin}/api/posts/${postId}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mintUserToken(String(post.userId))}`,
        "Content-Type": "application/json",
      },
      // The publish route's own ceiling is 299s; this sits just past it so a
      // route that is merely slow still reports its own error rather than
      // being cut off here as a bare timeout.
      signal: AbortSignal.timeout(295_000),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // The publish route writes the post's own status on the paths it
      // controls, but a non-2xx means it may have bailed before doing so —
      // which would strand the post in "publishing" forever, invisible to both
      // the queue and a retry. Stamp a terminal status ourselves.
      await Post.findByIdAndUpdate(postId, { $set: { status: "failed" } });
      return {
        postId,
        status: "failed",
        error: data?.error || `publish_failed_${res.status}`,
      };
    }

    const status =
      data?.post?.status === "published"
        ? "published"
        : data?.post?.status === "partial"
          ? "partial"
          : "failed";

    const failed = (data?.post?.targets || []).filter((t: any) => t.status === "failed");
    return {
      postId,
      status,
      ...(failed.length > 0
        ? { error: failed.map((t: any) => `${t.platform}: ${t.error}`).join("; ") }
        : {}),
    };
  } catch (err: any) {
    await Post.findByIdAndUpdate(postId, { $set: { status: "failed" } });
    return {
      postId,
      status: "failed",
      error: `publish_threw: ${err?.message || "unknown"}`,
    };
  }
}

// Every scheduled post whose moment has passed, oldest first, plus the ones
// that slipped past the grace window.
//
// Sorted by scheduledAt so a backlog drains in the order the user queued it —
// posts written to be read in sequence should not go out shuffled.
export async function runQueue(
  now: Date,
  origin: string,
  mintUserToken: (userId: string) => string,
  maxPerRun: number
): Promise<{ due: number; deferred: number; results: QueueOutcome[] }> {
  const candidates = await Post.find({
    status: "scheduled",
    scheduledAt: { $lte: now },
  }).sort({ scheduledAt: 1 });

  const due: any[] = [];
  const expired: any[] = [];
  for (const post of candidates) {
    const check = isQueueDue(post, now);
    if (check.due) due.push(post);
    else if (check.reason === "missed_window") expired.push(post);
  }

  const results: QueueOutcome[] = [];

  // Retire the ones that are past saving first — it's a cheap write, and
  // leaving them "scheduled" would make them reappear on every future tick,
  // growing the candidate scan without ever producing a post.
  for (const post of expired) {
    await Post.findByIdAndUpdate(post._id, {
      $set: {
        status: "failed",
        "targets.$[t].status": "skipped",
        "targets.$[t].error": "missed_schedule",
      },
    }, { arrayFilters: [{ "t.status": "pending" }] });
    results.push({
      postId: String(post._id),
      status: "expired",
      error: "missed_schedule",
    });
  }

  const slice = due.slice(0, maxPerRun);
  for (const post of slice) {
    results.push(await publishOne(post, origin, mintUserToken));
  }

  return {
    due: due.length,
    deferred: Math.max(0, due.length - slice.length),
    results,
  };
}
