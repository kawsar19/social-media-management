import { NextResponse } from "next/server";

// Threads recent activity for the unified inbox.
//
// The Threads token identifies the account, so we address it as `/me` (same as
// the share route). Client sends `Authorization: Bearer <threadsAccessToken>`.
//
// GET /api/auth/threads/activity?since=<unixSeconds>
// Returns:
//   { items: [{ id, platform:"threads", type:"comment"|"mention",
//               author, text, timestamp, permalink, context }], errors: {} }
//
// Coverage:
//  - comments: recent threads (/me/threads), then each thread's replies
//    (/{thread-id}/replies). Threads models a reply as a comment.
//  - Threads has no DM API, so there is no message lane here.
const GRAPH = "https://graph.threads.net/v1.0";

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

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since"); // unix seconds, optional

  const errors = {};
  try {
    const items = await fetchReplies(token, since);
    return NextResponse.json({ items, errors });
  } catch (e) {
    errors.comments = e.message || "threads_activity_failed";
    return NextResponse.json({ items: [], errors });
  }
}

async function fetchReplies(token, since) {
  const threadsUrl = new URL(`${GRAPH}/me/threads`);
  threadsUrl.searchParams.set("fields", "id,text,permalink");
  threadsUrl.searchParams.set("limit", "15");
  if (since) threadsUrl.searchParams.set("since", since);
  threadsUrl.searchParams.set("access_token", token);

  const res = await fetchWithRetry(threadsUrl, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || "threads_fetch_failed");
  }

  const threads = data.data || [];
  const perThread = await Promise.all(
    threads.map(async (t) => {
      const url = new URL(`${GRAPH}/${t.id}/replies`);
      url.searchParams.set(
        "fields",
        "id,text,username,timestamp,permalink"
      );
      url.searchParams.set("access_token", token);
      const rr = await fetchWithRetry(url, { cache: "no-store" });
      const rd = await rr.json();
      if (!rr.ok || rd.error) return [];
      const ctx = (t.text || "").slice(0, 80);
      return (rd.data || []).map((r) => ({
        id: `th_r_${r.id}`,
        platform: "threads",
        type: "comment",
        author: r.username ? `@${r.username}` : "Threads user",
        text: r.text || "",
        timestamp: r.timestamp || null,
        permalink: r.permalink || t.permalink || null,
        context: ctx ? `replied to: "${ctx}"` : "replied to your thread",
      }));
    })
  );
  return perThread.flat();
}
