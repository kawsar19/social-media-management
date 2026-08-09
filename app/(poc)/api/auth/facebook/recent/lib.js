// Shared logic for the notification feed: the newest Messenger threads across
// *every* connected Page, merged into one list. Both the plain JSON endpoint
// (/recent) and the live SSE stream (/recent/stream) build on this, so the
// polling loop and the one-shot fetch can never drift apart.

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

// Every Page the user manages, with its Page token. The notification feed spans
// all of them, so unlike the per-thread routes we keep the whole list rather
// than finding one page by id.
export async function getPages(userToken) {
  const url = new URL(`${GRAPH}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", userToken);
  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return { error: data.error?.message || "failed_to_load_pages" };
  }
  return {
    pages: (data.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      token: p.access_token,
    })),
  };
}

// A one-line stand-in for a message whose content is an attachment rather than
// text, so rows read "Photo" instead of nothing.
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

// The newest `limit` threads for one Page. Returns [] on failure rather than
// throwing: one Page missing the pages_messaging permission shouldn't blank out
// the notifications from every other Page.
async function fetchPageThreads(page, limit) {
  const url = new URL(`${GRAPH}/${page.id}/conversations`);
  url.searchParams.set(
    "fields",
    "id,updated_time,unread_count,participants,messages.limit(1){id,message,from,created_time,attachments{mime_type}}"
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", page.token);

  let res;
  try {
    res = await fetchWithRetry(url, { cache: "no-store" });
  } catch {
    return { threads: [], error: `${page.name}: request failed` };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    return { threads: [], error: `${page.name}: ${data.error?.message || "load_failed"}` };
  }

  const threads = (data.data || []).map((conv) => {
    const msg = conv.messages?.data?.[0];
    const other = (conv.participants?.data || []).find((pp) => pp.id !== page.id);
    // Who sent the newest message decides whether this is something to act on:
    // our own reply is not a notification.
    const fromPage = msg?.from?.id === page.id;
    return {
      id: conv.id,
      pageId: page.id,
      pageName: page.name,
      recipientId: other?.id || null,
      name: other?.name || msg?.from?.name || "Facebook user",
      snippet: msg?.message || describeAttachments(msg),
      timestamp: msg?.created_time || conv.updated_time || null,
      unread: (conv.unread_count || 0) > 0,
      fromPage,
      // Facebook's free-form reply window runs 24h from the person's last
      // message. Computed here so the dropdown can disable the composer
      // without loading the whole thread first.
      lastInboundAt: fromPage ? null : msg?.created_time || null,
    };
  });
  return { threads };
}

// The merged, newest-first notification feed across every Page. `pageIds`
// optionally narrows it to the Pages enabled in the UI.
export async function getRecentThreads(userToken, { limit = 15, pageIds = null } = {}) {
  const { pages, error } = await getPages(userToken);
  if (error) return { error };

  const selected = pageIds?.length ? pages.filter((p) => pageIds.includes(p.id)) : pages;
  if (selected.length === 0) return { threads: [], errors: [] };

  const results = await Promise.all(selected.map((p) => fetchPageThreads(p, limit)));

  const threads = results
    .flatMap((r) => r.threads)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, limit);

  // Partial failures are reported alongside the data instead of replacing it —
  // three working Pages and one unauthorized Page should still show three.
  const errors = results.map((r) => r.error).filter(Boolean);
  return { threads, errors };
}

// A cheap change-detector for the polling loop: the identity of the newest
// message per thread plus its unread state. If this string is unchanged, there
// is nothing to push to the browser.
export function feedSignature(threads) {
  return threads.map((t) => `${t.id}:${t.timestamp}:${t.unread ? 1 : 0}`).join("|");
}
