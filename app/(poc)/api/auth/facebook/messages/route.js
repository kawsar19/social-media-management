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

// Graph error subcode/code for "outside the allowed messaging window" — the
// standard 24h reply window has closed since the person's last message.
function isOutsideWindow(err) {
  if (!err) return false;
  return err.code === 10 || /outside of allowed window/i.test(err.message || "");
}

// Graph error for a tag the app hasn't been approved to use — the Human Agent
// feature is a separate App Review item from `pages_messaging`.
function isTagNotApproved(err) {
  if (!err) return false;
  return /cannot tag messages|without prior approval/i.test(err.message || "");
}

async function sendMessage(pageId, pageToken, recipientId, text, tag) {
  const payload = {
    recipient: { id: recipientId },
    message: { text },
    // A tagged send must declare MESSAGE_TAG; untagged replies use RESPONSE.
    messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE",
    ...(tag ? { tag } : {}),
    access_token: pageToken,
  };
  const res = await fetchWithRetry(`${GRAPH}/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { res, data };
}

// POST /api/auth/facebook/messages  { pageId, recipientId, message }
// Sends a direct message reply from the Page to a person (their PSID).
// Returns { id, tag } on success — `tag` is null for a normal reply, or
// "HUMAN_AGENT" when the send needed the extended window.
//
// Requires the `pages_messaging` permission (Meta App Review). Facebook only
// allows a free-form reply within 24h of the person's last message; past that,
// a plain send fails with error #10. Because every message here is typed by a
// human in the dashboard (not a bot), we retry once with the HUMAN_AGENT tag,
// which Meta grants for exactly this case and which extends the window to 7
// days. Past 7 days nothing can be sent, and that error is surfaced unchanged.
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

  let tag = null;
  let { res, data } = await sendMessage(pageId, pageToken, recipientId, message);

  // The 24h window has closed — retry as a human agent reply (7-day window).
  const windowClosed = (!res.ok || data.error) && isOutsideWindow(data.error);
  if (windowClosed) {
    tag = "HUMAN_AGENT";
    const retry = await sendMessage(pageId, pageToken, recipientId, message, tag);
    // If the app isn't approved for the tag, the retry's own error (#100) says
    // nothing useful to the person typing — keep the original window error so
    // the UI explains the real reason the message can't go out.
    if (isTagNotApproved(retry.data?.error)) {
      tag = null;
    } else {
      ({ res, data } = retry);
    }
  }

  if (!res.ok || data.error) {
    return NextResponse.json(
      {
        error: data.error?.message || "send_failed",
        // Tells the client this failed because the reply window has closed, so
        // it can explain that rather than blaming permissions.
        outsideWindow: isOutsideWindow(data.error),
        // True when the extended window would have helped but the app lacks
        // the Human Agent approval — an actionable, fixable setup gap.
        needsHumanAgent: windowClosed && tag === null,
      },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  return NextResponse.json({ id: data.message_id || data.id || null, tag });
}
