import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Node's fetch (undici) can hang on graph.facebook.com; retry with a bounded
// per-attempt timeout.
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

// Look up the Page access token for a given Page id from the user's managed
// Pages. Reading/deleting a Page's posts requires the Page token, not the user
// token.
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

// GET /api/auth/facebook/posts?pageId=<id>&limit=<n>
// Lists recent posts for a Page. Returns:
// { posts: [{ id, message, story, createdTime, permalink, picture }] }
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId");
  const limit = searchParams.get("limit") || "25";
  if (!pageId) {
    return NextResponse.json({ error: "missing_page_id" }, { status: 400 });
  }

  const { token: pageToken, error: tokenError } = await getPageToken(
    userToken,
    pageId
  );
  if (tokenError) {
    return NextResponse.json({ error: tokenError }, { status: 400 });
  }

  const url = new URL(`${GRAPH}/${pageId}/feed`);
  url.searchParams.set(
    "fields",
    "id,message,story,created_time,permalink_url,full_picture"
  );
  url.searchParams.set("limit", limit);
  url.searchParams.set("access_token", pageToken);

  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "posts_fetch_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  const posts = (data.data || []).map((p) => ({
    id: p.id,
    message: p.message || null,
    story: p.story || null,
    createdTime: p.created_time || null,
    permalink: p.permalink_url || null,
    picture: p.full_picture || null,
  }));

  return NextResponse.json({ posts });
}

// DELETE /api/auth/facebook/posts?pageId=<id>&postId=<id>
// Permanently deletes a single Page post. Returns { ok: true } on success.
export async function DELETE(request) {
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

  const { token: pageToken, error: tokenError } = await getPageToken(
    userToken,
    pageId
  );
  if (tokenError) {
    return NextResponse.json({ error: tokenError }, { status: 400 });
  }

  const url = new URL(`${GRAPH}/${postId}`);
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
