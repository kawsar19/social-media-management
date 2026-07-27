import { NextResponse } from "next/server";

const YT = "https://www.googleapis.com/youtube/v3";

async function fetchWithRetry(input, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(15000) });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function bearer(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

function ytGet(token, path, params) {
  const url = new URL(`${YT}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetchWithRetry(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// GET /api/auth/youtube/activity
//
// Returns recent comments across the channel's latest videos, normalized for
// the unified inbox:
//   { items: [{ id, platform:"youtube", type:"comment", author, text,
//               timestamp, permalink, context }], errors: {} }
//
// We deliberately fan out per video (uploads playlist -> recent video ids ->
// commentThreads?videoId=<id>) rather than using
// commentThreads?allThreadsRelatedToChannelId, which is unreliable and
// routinely returns an empty list even when the videos have comments. This
// mirrors the proven path the /youtube page uses.
//
// YouTube has no DM/message API, so there is only a comment lane. Time
// filtering is applied client-side after merge (commentThreads has no `since`).
export async function GET(request) {
  const token = bearer(request);
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const errors = {};

  // 1. The user's channel -> uploads playlist id.
  const chRes = await ytGet(token, "channels", {
    part: "contentDetails",
    mine: "true",
  });
  const chData = await chRes.json();
  if (!chRes.ok || chData.error) {
    return NextResponse.json(
      { error: chData.error?.message || "channel_fetch_failed" },
      { status: chRes.status === 200 ? 400 : chRes.status }
    );
  }
  const uploads =
    chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
  if (!uploads) {
    return NextResponse.json({ items: [], errors });
  }

  // 2. Recent uploads -> video ids + titles (for per-comment context).
  const plRes = await ytGet(token, "playlistItems", {
    part: "contentDetails,snippet",
    playlistId: uploads,
    maxResults: "10",
  });
  const plData = await plRes.json();
  if (!plRes.ok || plData.error) {
    errors.comments = plData.error?.message || "uploads_fetch_failed";
    return NextResponse.json({ items: [], errors });
  }
  const videos = (plData.items || [])
    .map((it) => ({
      id: it.contentDetails?.videoId,
      title: it.snippet?.title || "",
    }))
    .filter((v) => v.id);

  // 3. Fetch comment threads for each video concurrently. Per-video
  //    commentThreads is the reliable endpoint (order=time = newest first).
  const perVideo = await Promise.all(
    videos.map(async (video) => {
      const res = await ytGet(token, "commentThreads", {
        part: "snippet",
        videoId: video.id,
        maxResults: "25",
        order: "time",
      });
      const data = await res.json();
      // A single video may have comments disabled (403); skip it, don't fail
      // the whole request.
      if (!res.ok || data.error) return [];
      const title = video.title.slice(0, 80);
      return (data.items || []).map((thread) => {
        const top = thread.snippet?.topLevelComment?.snippet || {};
        return {
          id: `yt_c_${thread.id}`,
          platform: "youtube",
          type: "comment",
          author: top.authorDisplayName || "YouTube user",
          text: top.textDisplay || "",
          timestamp: top.publishedAt || null,
          permalink: `https://www.youtube.com/watch?v=${video.id}&lc=${thread.id}`,
          context: title ? `on video: "${title}"` : "on your video",
        };
      });
    })
  );

  const items = perVideo.flat();
  return NextResponse.json({ items, errors });
}
