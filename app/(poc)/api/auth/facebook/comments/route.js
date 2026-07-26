import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

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

async function getPageToken(userToken, pageId) {
  const url = new URL(`${GRAPH}/me/accounts`);
  url.searchParams.set("fields", "id,access_token");
  url.searchParams.set("access_token", userToken);
  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return { error: data.error?.message || "failed_to_load_pages" };
  }
  const page = (data.data || []).find((p) => p.id === pageId);
  if (!page) return { error: "page_not_found" };
  return { token: page.access_token };
}

// GET /api/auth/facebook/comments?pageId=<id>&postId=<id>
// Lists comments on a post: { comments: [{ id, from, message, createdTime }] }
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId");
  const postId = searchParams.get("postId");
  if (!pageId || !postId) {
    return NextResponse.json(
      { error: "missing_page_or_post_id" },
      { status: 400 }
    );
  }

  const { token: pageToken, error } = await getPageToken(userToken, pageId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const url = new URL(`${GRAPH}/${postId}/comments`);
  // Each top-level comment also carries its nested replies via the `comments`
  // edge (Facebook models a reply as a comment on a comment).
  url.searchParams.set(
    "fields",
    "id,from,message,created_time,comments{id,from,message,created_time}"
  );
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", pageToken);

  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "comments_fetch_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  const mapComment = (c) => ({
    id: c.id,
    from: c.from?.name || "Unknown",
    message: c.message || "",
    createdTime: c.created_time || null,
  });

  const comments = (data.data || []).map((c) => ({
    ...mapComment(c),
    replies: (c.comments?.data || []).map(mapComment),
  }));

  return NextResponse.json({ comments });
}

// POST /api/auth/facebook/comments  { pageId, postId, message }
// Replies to a post with a new comment. Returns { id }.
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const body = await request.json().catch(() => null);
  const pageId = body?.pageId;
  const postId = body?.postId;
  const commentId = body?.commentId; // when replying to a specific comment
  const message = body?.message?.toString() ?? "";
  // Target is a specific comment (nested reply) if commentId is given,
  // otherwise the post (top-level comment).
  const targetId = commentId || postId;
  if (!pageId || !targetId || !message.trim()) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { token: pageToken, error } = await getPageToken(userToken, pageId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const res = await fetchWithRetry(`${GRAPH}/${targetId}/comments`, {
    method: "POST",
    body: new URLSearchParams({ message, access_token: pageToken }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "reply_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  return NextResponse.json({ id: data.id });
}

// DELETE /api/auth/facebook/comments?pageId=<id>&commentId=<id>
// Deletes a single comment. Returns { ok: true }.
export async function DELETE(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId");
  const commentId = searchParams.get("commentId");
  if (!pageId || !commentId) {
    return NextResponse.json(
      { error: "missing_page_or_comment_id" },
      { status: 400 }
    );
  }

  const { token: pageToken, error } = await getPageToken(userToken, pageId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const url = new URL(`${GRAPH}/${commentId}`);
  url.searchParams.set("access_token", pageToken);
  const res = await fetchWithRetry(url, { method: "DELETE", cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "delete_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  return NextResponse.json({ ok: true });
}
