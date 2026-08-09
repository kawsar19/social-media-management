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
    post.status = "publishing";
    await post.save();

    // Download media once for the file-upload platforms.
    const mediaBlob = await fetchMediaBlob(post.mediaUrl);
    const mediaName =
      post.mediaType === "video" ? "upload.mp4" : "upload.jpg";
    const ctx: Ctx = { origin, userId: user.userId, post, mediaBlob, mediaName };

    // Facebook: all its targets (one per Page) publish in a single share call,
    // then we map the per-Page results back onto each target by pageId.
    const fbTargets = post.targets.filter((t: any) => t.platform === "facebook");
    const fbHandled = new Set<any>();
    if (fbTargets.length > 0) {
      const { token } = await resolvePlatformToken(user.userId, "facebook");
      if (!token) {
        for (const t of fbTargets) {
          t.status = "failed";
          t.error = "no_facebook_token";
          fbHandled.add(t);
        }
      } else {
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
            } else {
              t.status = "failed";
              t.error = r?.error || data.error || "publish_failed";
            }
            fbHandled.add(t);
          }
        } catch {
          for (const t of fbTargets) {
            t.status = "failed";
            t.error = "network_error";
            fbHandled.add(t);
          }
        }
      }
    }

    // Everything else: publish each target independently.
    for (const target of post.targets) {
      if (fbHandled.has(target)) continue;

      const { token } = await resolvePlatformToken(user.userId, target.platform);
      if (!token) {
        target.status = "failed";
        target.error = `no_${target.platform}_token`;
        continue;
      }

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
        } else {
          target.status = "failed";
          target.error = out.error;
        }
      } catch {
        target.status = "failed";
        target.error = "network_error";
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

    // Every target has been attempted, so the staged video has served its
    // purpose — drop it after the response, once the URL-fetching platforms
    // have had time to pull it. Images are kept so the saved post still renders
    // a preview. Runs on failures too: a failed publish leaves the same
    // orphaned object behind.
    const stagedMediaUrl = post.mediaUrl;
    const stagedMediaType = post.mediaType;
    after(() => scheduleMediaCleanup(stagedMediaUrl, stagedMediaType));

    return NextResponse.json({ post });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
