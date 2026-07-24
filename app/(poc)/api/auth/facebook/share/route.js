import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Node's fetch (undici) sometimes hangs on graph.facebook.com (IPv6 / flaky
// network) and times out after ~10s. Retry a couple of times with a bounded
// per-attempt timeout so a single stuck connection doesn't fail the request.
async function fetchWithRetry(input, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Publishes a post (text, optionally one image) to one or more Facebook Pages.
// Client sends `Authorization: Bearer <userAccessToken>` and multipart/form-data:
//   text     (string)
//   image    (File, optional)
//   pageIds  (JSON array of Page ids to post to)
//
// Facebook requires a *Page* access token (not the user token) to post to a
// Page. We fetch /me/accounts once to map each selected Page id to its own
// page token, then post to each Page's /feed (text) or /photos (image).
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const form = await request.formData().catch(() => null);
  const text = form?.get("text")?.toString() ?? "";
  const image = form?.get("image"); // File or null

  let pageIds = [];
  try {
    pageIds = JSON.parse(form?.get("pageIds")?.toString() ?? "[]");
  } catch {
    pageIds = [];
  }

  if (!text.trim() && !(image && image.size > 0)) {
    return NextResponse.json({ error: "empty_post" }, { status: 400 });
  }
  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    return NextResponse.json({ error: "no_pages_selected" }, { status: 400 });
  }

  // Map selected Page ids -> their Page access tokens.
  const accountsUrl = new URL(`${GRAPH}/me/accounts`);
  accountsUrl.searchParams.set("fields", "id,name,access_token");
  accountsUrl.searchParams.set("access_token", userToken);
  const accountsRes = await fetchWithRetry(accountsUrl, { cache: "no-store" });
  const accountsData = await accountsRes.json();

  if (!accountsRes.ok || accountsData.error) {
    return NextResponse.json(
      { error: accountsData.error?.message || "failed_to_load_pages" },
      { status: accountsRes.status || 502 }
    );
  }

  const tokenByPage = new Map(
    (accountsData.data || []).map((p) => [p.id, p.access_token])
  );
  const nameByPage = new Map(
    (accountsData.data || []).map((p) => [p.id, p.name])
  );

  // Read the image bytes once (reused across all Pages).
  const hasImage =
    image && typeof image.arrayBuffer === "function" && image.size > 0;
  const imageBytes = hasImage ? await image.arrayBuffer() : null;

  // Post to each selected Page independently; collect per-Page results so one
  // failure doesn't block the others.
  const results = await Promise.all(
    pageIds.map(async (pageId) => {
      const pageToken = tokenByPage.get(pageId);
      const pageName = nameByPage.get(pageId) || pageId;
      if (!pageToken) {
        return { pageId, pageName, ok: false, error: "page_token_not_found" };
      }

      try {
        if (hasImage) {
          // Photo post: /{page_id}/photos with caption + binary source.
          const body = new FormData();
          body.append("caption", text);
          body.append("access_token", pageToken);
          body.append(
            "source",
            new Blob([imageBytes], { type: image.type || "image/jpeg" }),
            image.name || "upload.jpg"
          );
          const res = await fetchWithRetry(`${GRAPH}/${pageId}/photos`, {
            method: "POST",
            body,
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            return {
              pageId,
              pageName,
              ok: false,
              error: data.error?.message || "photo_post_failed",
            };
          }
          return { pageId, pageName, ok: true, id: data.post_id || data.id };
        }

        // Text-only post: /{page_id}/feed with message.
        const body = new URLSearchParams({
          message: text,
          access_token: pageToken,
        });
        const res = await fetchWithRetry(`${GRAPH}/${pageId}/feed`, {
          method: "POST",
          body,
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          return {
            pageId,
            pageName,
            ok: false,
            error: data.error?.message || "feed_post_failed",
          };
        }
        return { pageId, pageName, ok: true, id: data.id };
      } catch {
        return { pageId, pageName, ok: false, error: "network_error" };
      }
    })
  );

  return NextResponse.json({ results });
}
