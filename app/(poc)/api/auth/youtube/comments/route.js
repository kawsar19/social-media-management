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

  // Shape a single reply comment resource into our reply object.
  function mapReply(r) {
    return {
      id: r.id,
      author: r.snippet?.authorDisplayName || null,
      authorImage: r.snippet?.authorProfileImageUrl || null,
      text: r.snippet?.textDisplay || null,
      likeCount: r.snippet?.likeCount ?? 0,
      publishedAt: r.snippet?.publishedAt || null,
    };
  }

  // commentThreads only inlines a *partial sample* of replies (and omits them
  // entirely once a thread has enough), so a freshly posted reply or older
  // ones can be missing. For any thread that reports replies, fetch the full,
  // ordered list via comments.list?parentId. Falls back to the inline sample
  // if that call fails.
  async function fetchAllReplies(threadId, inline) {
    if (!threadId) return (inline || []).map(mapReply);
    const rUrl = new URL(`${YT}/comments`);
    rUrl.searchParams.set("part", "snippet");
    rUrl.searchParams.set("parentId", threadId);
    rUrl.searchParams.set("maxResults", "100");
    try {
      const rRes = await fetchWithRetry(rUrl, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const rData = await rRes.json();
      if (rRes.ok && !rData.error) {
        // comments.list returns newest-first; reverse to chronological order.
        return (rData.items || []).map(mapReply).reverse();
      }
    } catch {
      // ignore and fall back
    }
    return (inline || []).map(mapReply);
  }

  const comments = await Promise.all(
    (data.items || []).map(async (thread) => {
      const top = thread.snippet?.topLevelComment?.snippet || {};
      const replyCount = thread.snippet?.totalReplyCount ?? 0;
      const inline = thread.replies?.comments || [];
      // Only spend a request when the thread actually has replies.
      const replies =
        replyCount > 0 ? await fetchAllReplies(thread.id, inline) : [];
      return {
        id: thread.id,
        author: top.authorDisplayName || null,
        authorImage: top.authorProfileImageUrl || null,
        text: top.textDisplay || null,
        likeCount: top.likeCount ?? 0,
        publishedAt: top.publishedAt || null,
        replies,
      };
    })
  );

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
