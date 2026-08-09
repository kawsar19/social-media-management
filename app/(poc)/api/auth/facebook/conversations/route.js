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

// A one-line stand-in for a message whose content is an attachment rather than
// text, so list rows read "Photo" instead of nothing.
function describeAttachments(msg) {
  const atts = msg?.attachments?.data || [];
  if (atts.length === 0) return "";
  const mime = atts[0].mime_type || "";
  const label = mime.startsWith("image/")
    ? "Photo"
    : mime.startsWith("video/")
      ? "Video"
      : mime.startsWith("audio/")
        ? "Voice message"
        : "Attachment";
  return atts.length > 1 ? `${label} +${atts.length - 1}` : label;
}

// GET /api/auth/facebook/conversations?pageId=<id>&after=<cursor>&limit=<n>
//
// Returns ONE page of Messenger conversation threads (newest first), plus the
// cursor to fetch the next page — the shape a messenger-style infinite-scroll
// list needs:
//   { threads: [{ id, recipientId, name, snippet, timestamp, unread }],
//     nextCursor: string | null, pageId }
//
// Requires the `pages_messaging` permission (Meta App Review). Without it the
// Graph call fails and we surface the error so the client can show a notice
// rather than an empty list.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId");
  const after = searchParams.get("after"); // paging cursor, optional
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);
  if (!pageId) {
    return NextResponse.json({ error: "missing_page_id" }, { status: 400 });
  }

  const { token: pageToken, error } = await getPageToken(userToken, pageId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const url = new URL(`${GRAPH}/${pageId}/conversations`);
  url.searchParams.set(
    "fields",
    "id,updated_time,unread_count,participants,messages.limit(1){id,message,from,created_time,attachments{mime_type}}"
  );
  url.searchParams.set("limit", String(limit));
  if (after) url.searchParams.set("after", after);
  url.searchParams.set("access_token", pageToken);

  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "conversations_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  const threads = (data.data || []).map((conv) => {
    const msg = conv.messages?.data?.[0];
    // The person to reply to = the participant that isn't the Page itself.
    const other = (conv.participants?.data || []).find((pp) => pp.id !== pageId);
    return {
      id: conv.id,
      recipientId: other?.id || null,
      name: other?.name || msg?.from?.name || "Facebook user",
      // An attachment-only message has no text, so describe it instead of
      // leaving the row blank — the way Messenger shows "Photo".
      snippet: msg?.message || describeAttachments(msg),
      timestamp: msg?.created_time || conv.updated_time || null,
      unread: (conv.unread_count || 0) > 0,
    };
  });

  return NextResponse.json({
    threads,
    nextCursor: data.paging?.cursors?.after || null,
    pageId,
  });
}
