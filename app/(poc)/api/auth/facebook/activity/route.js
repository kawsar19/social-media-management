import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Node's fetch (undici) can hang on graph.facebook.com; retry with a bounded
// per-attempt timeout. Same helper the other facebook/* routes use.
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

// GET /api/auth/facebook/activity?pageId=<id>&since=<unixSeconds>
//
// Returns the recent activity on a Page as a flat, normalized list so the
// unified inbox can merge it with the other platforms:
//   { items: [{ id, platform, type, author, text, timestamp, permalink,
//               context }], errors: { comments?, mentions?, messages? } }
//
// type is one of: "comment", "mention", "message".
// `since` (unix seconds) is passed to the Graph API where supported and is
// also re-checked client-side after merging, so it's a best-effort filter.
//
// Notes on coverage:
//  - comments: fetched per recent post (Graph has no page-wide comment feed),
//    so we pull recent posts then their comments.
//  - mentions: /{page}/tagged and /{page}/visitor_posts.
//  - messages: /{page}/conversations — REQUIRES the `pages_messaging`
//    permission approved via Meta App Review. Until then this sub-fetch fails
//    and its error is surfaced under errors.messages (the rest still works).
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId");
  const since = searchParams.get("since"); // unix seconds, optional
  if (!pageId) {
    return NextResponse.json({ error: "missing_page_id" }, { status: 400 });
  }

  const { token: pageToken, error } = await getPageToken(userToken, pageId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const errors = {};

  // Run the three sub-fetches concurrently. Each is independently guarded so a
  // single failure (e.g. no messaging permission) doesn't sink the others.
  const [comments, mentions, messages] = await Promise.all([
    fetchComments(pageId, pageToken, since).catch((e) => {
      errors.comments = e.message || "comments_failed";
      return [];
    }),
    fetchMentions(pageId, pageToken, since).catch((e) => {
      errors.mentions = e.message || "mentions_failed";
      return [];
    }),
    fetchMessages(pageId, pageToken).catch((e) => {
      errors.messages = e.message || "messages_failed";
      return [];
    }),
  ]);

  const items = [...comments, ...mentions, ...messages];
  return NextResponse.json({ items, errors });
}

// Pull recent posts, then each post's recent comments. `since` limits the post
// window at the API where possible; comments are date-filtered client-side.
async function fetchComments(pageId, pageToken, since) {
  const feedUrl = new URL(`${GRAPH}/${pageId}/feed`);
  feedUrl.searchParams.set("fields", "id,message,permalink_url");
  feedUrl.searchParams.set("limit", "15");
  if (since) feedUrl.searchParams.set("since", since);
  feedUrl.searchParams.set("access_token", pageToken);

  const feedRes = await fetchWithRetry(feedUrl, { cache: "no-store" });
  const feedData = await feedRes.json();
  if (!feedRes.ok || feedData.error) {
    throw new Error(feedData.error?.message || "posts_fetch_failed");
  }

  const posts = feedData.data || [];
  const perPost = await Promise.all(
    posts.map(async (post) => {
      const url = new URL(`${GRAPH}/${post.id}/comments`);
      url.searchParams.set("fields", "id,from,message,created_time,permalink_url");
      url.searchParams.set("limit", "25");
      url.searchParams.set("order", "reverse_chronological");
      if (since) url.searchParams.set("since", since);
      url.searchParams.set("access_token", pageToken);
      const res = await fetchWithRetry(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) return [];
      const postText = (post.message || "").slice(0, 80);
      return (data.data || []).map((c) => ({
        id: `fb_c_${c.id}`,
        platform: "facebook",
        type: "comment",
        author: c.from?.name || "Facebook user",
        text: c.message || "",
        timestamp: c.created_time || null,
        permalink: c.permalink_url || post.permalink_url || null,
        context: postText ? `on post: "${postText}"` : "on a post",
      }));
    })
  );
  return perPost.flat();
}

// Mentions = posts where the Page was tagged + posts others left on the Page.
async function fetchMentions(pageId, pageToken, since) {
  async function edge(name, label) {
    const url = new URL(`${GRAPH}/${pageId}/${name}`);
    url.searchParams.set("fields", "id,from,message,story,created_time,permalink_url");
    url.searchParams.set("limit", "25");
    if (since) url.searchParams.set("since", since);
    url.searchParams.set("access_token", pageToken);
    const res = await fetchWithRetry(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || data.error) return [];
    return (data.data || []).map((m) => ({
      id: `fb_m_${m.id}`,
      platform: "facebook",
      type: "mention",
      author: m.from?.name || "Facebook user",
      text: m.message || m.story || "",
      timestamp: m.created_time || null,
      permalink: m.permalink_url || null,
      context: label,
    }));
  }
  const [tagged, visitor] = await Promise.all([
    edge("tagged", "tagged your Page").catch(() => []),
    edge("visitor_posts", "posted on your Page").catch(() => []),
  ]);
  return [...tagged, ...visitor];
}

// Messages = latest message of each recent conversation. Requires the
// pages_messaging permission (App Review). Throws so the caller records the
// error rather than silently showing an empty Messages lane.
async function fetchMessages(pageId, pageToken) {
  const url = new URL(`${GRAPH}/${pageId}/conversations`);
  // `messages.limit(1)` gives us just the most recent message per thread.
  url.searchParams.set(
    "fields",
    "id,updated_time,participants,messages.limit(1){id,message,from,created_time}"
  );
  url.searchParams.set("limit", "25");
  url.searchParams.set("access_token", pageToken);
  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || "conversations_failed");
  }
  return (data.data || []).map((conv) => {
    const msg = conv.messages?.data?.[0];
    return {
      id: `fb_msg_${conv.id}`,
      platform: "facebook",
      type: "message",
      author: msg?.from?.name || "Facebook user",
      text: msg?.message || "",
      timestamp: msg?.created_time || conv.updated_time || null,
      permalink: null,
      context: "direct message",
    };
  });
}
