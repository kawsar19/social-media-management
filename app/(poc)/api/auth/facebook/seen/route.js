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

// POST /api/auth/facebook/seen  { pageId, recipientId }
// Marks the conversation with `recipientId` as read, which both clears the
// unread badge in our list and shows the blue "Seen" receipt on the person's
// side — the same thing opening a chat in Messenger does.
//
// This is a best-effort side effect of opening a thread: if it fails (most
// commonly because the 24h window has closed, since sender_action is subject
// to the same policy as a send), the thread is still perfectly readable. So we
// report the failure without treating it as an error the user must act on.
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const body = await request.json().catch(() => null);
  const pageId = body?.pageId;
  const recipientId = body?.recipientId;
  if (!pageId || !recipientId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { token: pageToken, error } = await getPageToken(userToken, pageId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const res = await fetchWithRetry(`${GRAPH}/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: "mark_seen",
      access_token: pageToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { ok: false, error: data.error?.message || "mark_seen_failed" },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true });
}
