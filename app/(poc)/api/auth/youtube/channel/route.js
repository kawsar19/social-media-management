import { NextResponse } from "next/server";

// YouTube Data API v3 base. No version env needed — v3 is the current API.
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

// Build an authorized GET to the YouTube API using the user's OAuth token.
function ytGet(token, path, params) {
  const url = new URL(`${YT}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetchWithRetry(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// GET /api/auth/youtube/channel
// Returns the signed-in user's channel plus their most recent uploads:
// { channel: { id, title, description, thumbnail, subscribers, videoCount,
//   viewCount }, videos: [{ id, title, thumbnail, publishedAt, views, likes,
//   comments }] }
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  // 1. The user's own channel (mine=true). Grab the uploads playlist id so we
  //    can list recent videos.
  const chRes = await ytGet(token, "channels", {
    part: "snippet,statistics,contentDetails",
    mine: "true",
  });
  const chData = await chRes.json();
  if (!chRes.ok || chData.error) {
    return NextResponse.json(
      { error: chData.error?.message || "channel_fetch_failed" },
      { status: chRes.status === 200 ? 400 : chRes.status }
    );
  }

  const ch = (chData.items || [])[0];
  if (!ch) {
    return NextResponse.json(
      { error: "no_channel_for_account" },
      { status: 404 }
    );
  }

  const uploadsPlaylist =
    ch.contentDetails?.relatedPlaylists?.uploads || null;

  const channel = {
    id: ch.id,
    title: ch.snippet?.title || null,
    description: ch.snippet?.description || null,
    thumbnail: ch.snippet?.thumbnails?.default?.url || null,
    subscribers: ch.statistics?.subscriberCount ?? null,
    videoCount: ch.statistics?.videoCount ?? null,
    viewCount: ch.statistics?.viewCount ?? null,
  };

  // 2. Recent uploads from the uploads playlist -> collect video ids.
  let videos = [];
  if (uploadsPlaylist) {
    const plRes = await ytGet(token, "playlistItems", {
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylist,
      maxResults: "10",
    });
    const plData = await plRes.json();
    if (plRes.ok && !plData.error) {
      const ids = (plData.items || [])
        .map((it) => it.contentDetails?.videoId)
        .filter(Boolean);

      // 3. One videos.list call gets stats for all of them at once.
      if (ids.length) {
        const vRes = await ytGet(token, "videos", {
          part: "snippet,statistics",
          id: ids.join(","),
        });
        const vData = await vRes.json();
        if (vRes.ok && !vData.error) {
          videos = (vData.items || []).map((v) => ({
            id: v.id,
            title: v.snippet?.title || null,
            thumbnail: v.snippet?.thumbnails?.medium?.url || null,
            publishedAt: v.snippet?.publishedAt || null,
            views: v.statistics?.viewCount ?? null,
            likes: v.statistics?.likeCount ?? null,
            comments: v.statistics?.commentCount ?? null,
          }));
        }
      }
    }
  }

  return NextResponse.json({ channel, videos });
}
