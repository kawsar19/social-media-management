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

// GET /api/auth/youtube/comments?videoId=<id>
// Reads top-level comment threads for a video plus their replies:
// { comments: [{ id, author, authorImage, text, likeCount, publishedAt,
//   replies: [{ id, author, text, likeCount, publishedAt }] }] }
export async function GET(request) {
  const token = bearer(request);
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "missing_video_id" }, { status: 400 });
  }

  const url = new URL(`${YT}/commentThreads`);
  url.searchParams.set("part", "snippet,replies");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("order", "time");

  const res = await fetchWithRetry(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "comments_fetch_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  const comments = (data.items || []).map((thread) => {
    const top = thread.snippet?.topLevelComment?.snippet || {};
    const replies = (thread.replies?.comments || []).map((r) => ({
      id: r.id,
      author: r.snippet?.authorDisplayName || null,
      text: r.snippet?.textDisplay || null,
      likeCount: r.snippet?.likeCount ?? 0,
      publishedAt: r.snippet?.publishedAt || null,
    }));
    return {
      id: thread.id,
      author: top.authorDisplayName || null,
      authorImage: top.authorProfileImageUrl || null,
      text: top.textDisplay || null,
      likeCount: top.likeCount ?? 0,
      publishedAt: top.publishedAt || null,
      replies,
    };
  });

  return NextResponse.json({ comments });
}

// POST /api/auth/youtube/comments
// Body: { parentId, text }  — posts a reply to an existing top-level comment.
// parentId is the top-level comment id (thread.id from GET above).
export async function POST(request) {
  const token = bearer(request);
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { parentId, text } = body || {};
  if (!parentId || !text?.trim()) {
    return NextResponse.json(
      { error: "parentId and text are required" },
      { status: 400 }
    );
  }

  // comments.insert with part=snippet creates a reply under parentId.
  const url = new URL(`${YT}/comments`);
  url.searchParams.set("part", "snippet");

  const res = await fetchWithRetry(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: { parentId, textOriginal: text },
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "reply_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  return NextResponse.json({
    reply: {
      id: data.id,
      author: data.snippet?.authorDisplayName || null,
      text: data.snippet?.textDisplay || null,
      likeCount: data.snippet?.likeCount ?? 0,
      publishedAt: data.snippet?.publishedAt || null,
    },
  });
}
