import { NextRequest, NextResponse, after } from "next/server";
import { connectDB } from "@/lib/db";
import Post from "@/lib/models/Post";
import { getUser } from "../../postSchema";
import {
  resolvePlatformToken,
  fetchMediaBlob,
  permalinkFor,
  scheduleMediaCleanup,
} from "./publishHelpers";

// POST /api/posts/[id]/publish
// Auth: Bearer <app JWT>.
//
// Publishes a saved post to every target, server-side. For each target we read
// the platform token from the DB (refreshing YouTube when needed) and call that
// platform's existing share route with an absolute URL, so all the tested
// per-platform logic is reused. File-upload platforms (LinkedIn/Facebook/
// YouTube) get the media re-uploaded as bytes downloaded from the stored R2
// URL; Instagram/Threads get that URL directly.
//
// Each target's result (status, platformPostId, permalink, error) is written
// back to post.targets, and the post's overall status becomes published /
// partial / failed.
//
// R2 is staging, not storage: once publishing is done the staged object is
// deleted (after a delay — see scheduleMediaCleanup) so nothing lingers.

// Covers the publish itself plus the delayed R2 cleanup that runs in `after`,
// which shares this route's budget.
export const maxDuration = 300;

// A media Blob is only fetched once and shared across file-upload targets.
type Ctx = {
  origin: string;
  userId: string;
  post: any;
  mediaBlob: Blob | null;
  mediaName: string;
};

function shareUrl(origin: string, platform: string) {
  return `${origin}/api/auth/${platform}/share`;
}

async function publishFileTarget(ctx: Ctx, target: any, token: string) {
  const { post, origin, mediaBlob, mediaName } = ctx;
  const fd = new FormData();

  if (target.platform === "youtube") {
    if (!mediaBlob) return { ok: false, error: "youtube_requires_video" };
    fd.append("video", mediaBlob, mediaName);
    fd.append("title", post.youtubeTitle || post.content.slice(0, 90) || "Untitled");
    fd.append("description", post.content || "");
    fd.append("privacy", post.youtubePrivacy || "private");
  } else {
    // linkedin
    fd.append("text", post.content || "");
    if (mediaBlob) {
      if (post.mediaType === "video") fd.append("video", mediaBlob, mediaName);
      else fd.append("image", mediaBlob, mediaName);
    }
  }

  const res = await fetch(shareUrl(origin, target.platform), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "publish_failed" };
  return { ok: true, id: data.id };
}

async function publishUrlTarget(ctx: Ctx, target: any, token: string) {
  const { post, origin } = ctx;
  const isVideo = post.mediaType === "video";
  const payload: Record<string, unknown> = {};

  if (target.platform === "instagram") {
    if (!post.mediaUrl) return { ok: false, error: "instagram_requires_media" };
    payload.igUserId = target.destinationId || target.accountId;
    payload.caption = post.content || "";
    if (isVideo) payload.videoUrl = post.mediaUrl;
    else payload.imageUrl = post.mediaUrl;
  } else {
    // threads — text and/or media
    payload.userId = target.destinationId || undefined;
    payload.text = post.content || "";
    if (post.mediaUrl) {
      if (isVideo) payload.videoUrl = post.mediaUrl;
      else payload.imageUrl = post.mediaUrl;
    }
  }

  const res = await fetch(shareUrl(origin, target.platform), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "publish_failed" };
  return { ok: true, id: data.id };
}

// A target's identity as the client sees it. destinationId disambiguates the
// Facebook Pages, which all share the "facebook" platform.
function targetKey(target: any) {
  return target.destinationId
    ? `${target.platform}:${target.destinationId}`
    : target.platform;
}

// One progress event. `start` names every target up front so the stepper can
// render the full list before anything publishes; `target` reports one target
// moving to running/success/failed; `done` carries the saved post.
type PublishEvent =
  | { type: "start"; targets: { key: string; platform: string; destinationName?: string }[] }
  | {
      type: "target";
      key: string;
      status: "running" | "success" | "failed";
      platformPostId?: string;
      permalink?: string;
      error?: string;
    }
  | { type: "done"; post: any }
  | { type: "error"; error: string };

// Publishes the post, yielding an event as each target starts and finishes.
//
// Written as a generator so the SSE and plain-JSON responses share one code
// path: the streaming branch forwards each event as it arrives, the JSON branch
// drains the generator and returns only the final post.
async function* runPublish(
  post: any,
  userId: string,
  origin: string
): AsyncGenerator<PublishEvent> {
  yield {
    type: "start",
    targets: post.targets.map((t: any) => ({
      key: targetKey(t),
      platform: t.platform,
      destinationName: t.destinationName,
    })),
  };

  post.status = "publishing";
  await post.save();

  // Download media once for the file-upload platforms.
  const mediaBlob = await fetchMediaBlob(post.mediaUrl);
  const mediaName = post.mediaType === "video" ? "upload.mp4" : "upload.jpg";
  const ctx: Ctx = { origin, userId, post, mediaBlob, mediaName };

  // Facebook: all its targets (one per Page) publish in a single share call,
  // then we map the per-Page results back onto each target by pageId.
  const fbTargets = post.targets.filter((t: any) => t.platform === "facebook");
  const fbHandled = new Set<any>();
  if (fbTargets.length > 0) {
    const { token } = await resolvePlatformToken(userId, "facebook");
    if (!token) {
      for (const t of fbTargets) {
        t.status = "failed";
        t.error = "no_facebook_token";
        fbHandled.add(t);
        yield { type: "target", key: targetKey(t), status: "failed", error: t.error };
      }
    } else {
      // Every Page goes out in one call, so they all enter "running" together.
      for (const t of fbTargets) {
        yield { type: "target", key: targetKey(t), status: "running" };
      }
      const fd = new FormData();
      fd.append("text", post.content || "");
      if (mediaBlob) {
        if (post.mediaType === "video") fd.append("video", mediaBlob, mediaName);
        else fd.append("image", mediaBlob, mediaName);
      }
      fd.append(
        "pageIds",
        JSON.stringify(fbTargets.map((t: any) => t.destinationId).filter(Boolean))
      );
      try {
        const res = await fetch(shareUrl(origin, "facebook"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        const results: any[] = data.results || [];
        for (const t of fbTargets) {
          const r = results.find((x) => x.pageId === t.destinationId);
          if (r?.ok) {
            t.status = "success";
            t.platformPostId = r.id;
            t.permalink = permalinkFor("facebook", r.id);
            t.publishedAt = new Date();
            yield {
              type: "target",
              key: targetKey(t),
              status: "success",
              platformPostId: t.platformPostId,
              permalink: t.permalink,
            };
          } else {
            t.status = "failed";
            t.error = r?.error || data.error || "publish_failed";
            yield { type: "target", key: targetKey(t), status: "failed", error: t.error };
          }
          fbHandled.add(t);
        }
      } catch (err: any) {
        console.error("[publish] facebook threw:", err);
        for (const t of fbTargets) {
          t.status = "failed";
          t.error = err?.message
            ? `network_error: ${err.message}`
            : "network_error";
          fbHandled.add(t);
          yield { type: "target", key: targetKey(t), status: "failed", error: t.error };
        }
      }
    }
  }

  // Everything else: publish each target independently.
  for (const target of post.targets) {
    if (fbHandled.has(target)) continue;

    const { token } = await resolvePlatformToken(
      userId,
      target.platform,
      target.platform === "youtube" ? target.destinationId : undefined
    );
    if (!token) {
      target.status = "failed";
      target.error = `no_${target.platform}_token`;
      yield {
        type: "target",
        key: targetKey(target),
        status: "failed",
        error: target.error,
      };
      continue;
    }

    yield { type: "target", key: targetKey(target), status: "running" };

    try {
      const out =
        target.platform === "instagram" || target.platform === "threads"
          ? await publishUrlTarget(ctx, target, token)
          : await publishFileTarget(ctx, target, token);

      if (out.ok) {
        target.status = "success";
        target.platformPostId = out.id;
        target.permalink = permalinkFor(
          target.platform,
          out.id,
          target.destinationName
        );
        target.publishedAt = new Date();
        yield {
          type: "target",
          key: targetKey(target),
          status: "success",
          platformPostId: target.platformPostId,
          permalink: target.permalink,
        };
      } else {
        target.status = "failed";
        target.error = out.error;
        yield {
          type: "target",
          key: targetKey(target),
          status: "failed",
          error: target.error,
        };
      }
    } catch (err: any) {
      // Keep the real reason. "network_error" alone is unactionable — an
      // out-of-memory abort on a large video and a genuinely unreachable share
      // route look identical without it.
      console.error(`[publish] ${target.platform} threw:`, err);
      target.status = "failed";
      target.error = err?.message ? `network_error: ${err.message}` : "network_error";
      yield {
        type: "target",
        key: targetKey(target),
        status: "failed",
        error: target.error,
      };
    }
  }

  // Roll up the overall status from the per-target outcomes.
  const successes = post.targets.filter((t: any) => t.status === "success").length;
  const total = post.targets.length;
  if (successes === 0) post.status = "failed";
  else if (successes < total) post.status = "partial";
  else post.status = "published";
  if (successes > 0 && !post.publishedAt) post.publishedAt = new Date();

  await post.save();
  yield { type: "done", post };
}

export async function POST(request: NextRequest, { params }: { params: any }) {
  try {
    await connectDB();
    const { id } = await params;
    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const post = await Post.findOne({ _id: id, userId: user.userId });
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!post.targets?.length) {
      return NextResponse.json({ error: "no_targets" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const wantsStream =
      new URL(request.url).searchParams.get("stream") === "1";

    // Read before publishing: once every target has been attempted the staged
    // video has served its purpose, so it's dropped after the response — once
    // the URL-fetching platforms have had time to pull it. Images are kept so
    // the saved post still renders a preview. Runs on failures too: a failed
    // publish leaves the same orphaned object behind.
    const stagedMediaUrl = post.mediaUrl;
    const stagedMediaType = post.mediaType;

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of runPublish(post, user.userId, origin)) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
              );
            }
          } catch {
            // The publish failed outright (not one target failing) — tell the
            // client rather than closing the stream on it silently.
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: "server_error" })}\n\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      });

      after(() => scheduleMediaCleanup(stagedMediaUrl, stagedMediaType));

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          // Proxies that buffer would defeat the point of streaming.
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Non-streaming callers (e.g. /profile/posts) still get one JSON response.
    for await (const event of runPublish(post, user.userId, origin)) {
      if (event.type === "error") {
        return NextResponse.json({ error: event.error }, { status: 500 });
      }
    }

    after(() => scheduleMediaCleanup(stagedMediaUrl, stagedMediaType));

    return NextResponse.json({ post });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
