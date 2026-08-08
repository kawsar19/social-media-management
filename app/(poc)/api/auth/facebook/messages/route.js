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

// POST /api/auth/facebook/messages  { pageId, recipientId, message }
// Sends a direct message reply from the Page to a person (their PSID).
// Returns { id } (the message id) on success.
//
// Requires the `pages_messaging` permission (Meta App Review) AND the
// standard messaging window: Facebook only allows a free-form reply within
// 24h of the user's last message. Outside that window the Graph API rejects
// the send, and its error is surfaced to the caller unchanged.
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const body = await request.json().catch(() => null);
  const pageId = body?.pageId;
  const recipientId = body?.recipientId;
  const message = body?.message?.toString() ?? "";
  if (!pageId || !recipientId || !message.trim()) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { token: pageToken, error } = await getPageToken(userToken, pageId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const res = await fetchWithRetry(`${GRAPH}/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      messaging_type: "RESPONSE",
      access_token: pageToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "send_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  return NextResponse.json({ id: data.message_id || data.id || null });
}
