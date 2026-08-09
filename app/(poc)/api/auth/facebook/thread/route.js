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

// Flattens a message's attachments/shares into one list the UI can render
// without knowing Graph's shapes. Photos and stickers arrive as `image_data`
// (with its own preview_url), files as `file_url`, and link previews as
// `shares`. Each becomes { kind, url, name, mime }.
function normalizeAttachments(m) {
  const out = [];
  for (const att of m.attachments?.data || []) {
    const img = att.image_data;
    if (img?.preview_url || img?.url) {
      out.push({
        kind: "image",
        url: img.preview_url || img.url,
        // The full-size original, so a click can open it undegraded.
        fullUrl: img.url || img.preview_url,
        name: att.name || "",
        mime: att.mime_type || "",
      });
      continue;
    }
    if (att.file_url) {
      // Audio and video still arrive as file_url; the mime type is what
      // distinguishes them from a generic document.
      const mime = att.mime_type || "";
      const kind = mime.startsWith("video/")
        ? "video"
        : mime.startsWith("audio/")
          ? "audio"
          : "file";
      out.push({
        kind,
        url: att.file_url,
        name: att.name || "",
        mime,
        size: att.size || null,
      });
    }
  }
  for (const sh of m.shares?.data || []) {
    if (sh.link) out.push({ kind: "link", url: sh.link, name: sh.name || sh.link });
  }
  return out;
}

// GET /api/auth/facebook/thread?pageId=<id>&threadId=<conversation id>&after=<cursor>
//
// Returns ONE page of messages inside a single Messenger conversation, oldest
// last (Graph returns newest first — the client reverses for display), plus the
// other participant so the view can title itself and know who to reply to:
//   { messages: [{ id, text, fromPage, fromName, timestamp }],
//     nextCursor: string | null, participant: { id, name } | null }
//
// `nextCursor` pages *backwards* into older messages — the direction a chat
// view scrolls. Same `pages_messaging` requirement as the conversations list.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId");
  const threadId = searchParams.get("threadId");
  const after = searchParams.get("after");
  const limit = Math.min(Number(searchParams.get("limit")) || 25, 50);
  if (!pageId || !threadId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { token: pageToken, error } = await getPageToken(userToken, pageId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const url = new URL(`${GRAPH}/${threadId}`);
  url.searchParams.set(
    "fields",
    `participants,messages.limit(${limit})${after ? `.after(${after})` : ""}` +
      "{id,message,from,created_time,attachments{id,name,mime_type,size,file_url,image_data},shares{link,name}}"
  );
  url.searchParams.set("access_token", pageToken);

  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "thread_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  const other = (data.participants?.data || []).find((p) => p.id !== pageId);
  const messages = (data.messages?.data || []).map((m) => ({
    id: m.id,
    text: m.message || "",
    fromPage: m.from?.id === pageId,
    fromName: m.from?.name || "",
    timestamp: m.created_time || null,
    attachments: normalizeAttachments(m),
  }));

  return NextResponse.json({
    messages,
    nextCursor: data.messages?.paging?.cursors?.after || null,
    participant: other ? { id: other.id, name: other.name } : null,
  });
}
