import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Video uploads can take a while; hint deployment platforms to allow more time.
export const maxDuration = 300;

// Node's fetch (undici) sometimes hangs on graph.facebook.com (IPv6 / flaky
// network) and times out after ~10s. Retry a couple of times with a bounded
// per-attempt timeout so a single stuck connection doesn't fail the request.
async function fetchWithRetry(input, init = {}, attempts = 3, timeoutMs = 15000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Uploads a video to one Page using the resumable upload protocol:
//   1. upload_phase=start    -> { upload_session_id, video_id, start/end offset }
//   2. upload_phase=transfer -> PUT each chunk [start_offset, end_offset); the
//        response hands back the next offsets until start === end.
//   3. upload_phase=finish   -> publishes the video (with description).
// This handles large files that a single-shot upload would choke on.
async function uploadPageVideo({ pageId, pageToken, videoBytes, contentType, description }) {
  const endpoint = `${GRAPH}/${pageId}/videos`;
  const fileSize = videoBytes.byteLength;

  // Phase 1: start.
  const startBody = new URLSearchParams({
    upload_phase: "start",
    access_token: pageToken,
    file_size: String(fileSize),
  });
  const startRes = await fetchWithRetry(endpoint, { method: "POST", body: startBody });
  const startData = await startRes.json();
  if (!startRes.ok || startData.error) {
    return { ok: false, error: startData.error?.message || "video_start_failed" };
  }

  const sessionId = startData.upload_session_id;
  const videoId = startData.video_id;
  let startOffset = Number(startData.start_offset);
  let endOffset = Number(startData.end_offset);

  // Phase 2: transfer chunks until the API stops advancing the offset.
  while (startOffset < endOffset) {
    const chunk = videoBytes.slice(startOffset, endOffset);
    const body = new FormData();
    body.append("upload_phase", "transfer");
    body.append("access_token", pageToken);
    body.append("upload_session_id", sessionId);
    body.append("start_offset", String(startOffset));
    body.append(
      "video_file_chunk",
      new Blob([chunk], { type: contentType }),
      "chunk"
    );

    // Chunks are large; give each transfer a generous timeout (2 min) so a
    // slow-but-progressing upload isn't aborted as a false network_error.
    const chunkRes = await fetchWithRetry(endpoint, { method: "POST", body }, 3, 120000);
    const chunkData = await chunkRes.json();
    if (!chunkRes.ok || chunkData.error) {
      return { ok: false, error: chunkData.error?.message || "video_transfer_failed" };
    }
    startOffset = Number(chunkData.start_offset);
    endOffset = Number(chunkData.end_offset);
  }

  // Phase 3: finish — this is what actually publishes the video.
  const finishBody = new URLSearchParams({
    upload_phase: "finish",
    access_token: pageToken,
    upload_session_id: sessionId,
  });
  if (description) finishBody.set("description", description);
  const finishRes = await fetchWithRetry(endpoint, { method: "POST", body: finishBody });
  const finishData = await finishRes.json();
  if (!finishRes.ok || finishData.error || finishData.success === false) {
    return { ok: false, error: finishData.error?.message || "video_finish_failed" };
  }

  return { ok: true, id: videoId };
}

// Publishes a post (text, optionally one image OR one video) to one or more
// Facebook Pages.
// Client sends `Authorization: Bearer <userAccessToken>` and multipart/form-data:
//   text     (string)
//   image    (File, optional)
//   video    (File, optional) — takes precedence over image when both are sent
//   pageIds  (JSON array of Page ids to post to)
//
// Facebook requires a *Page* access token (not the user token) to post to a
// Page. We fetch /me/accounts once to map each selected Page id to its own
// page token, then post to each Page's /videos (video), /photos (image), or
// /feed (text).
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const form = await request.formData().catch(() => null);
  const text = form?.get("text")?.toString() ?? "";
  const image = form?.get("image"); // File or null
  const video = form?.get("video"); // File or null

  let pageIds = [];
  try {
    pageIds = JSON.parse(form?.get("pageIds")?.toString() ?? "[]");
  } catch {
    pageIds = [];
  }

  const hasVideo =
    video && typeof video.arrayBuffer === "function" && video.size > 0;

  if (!text.trim() && !hasVideo && !(image && image.size > 0)) {
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

  // Read the media bytes once (reused across all Pages). A video takes
  // precedence over an image when both happen to be present.
  const hasImage =
    !hasVideo && image && typeof image.arrayBuffer === "function" && image.size > 0;
  const imageBytes = hasImage ? await image.arrayBuffer() : null;
  const videoBytes = hasVideo ? await video.arrayBuffer() : null;
  const videoType = hasVideo ? video.type || "video/mp4" : null;

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
        if (hasVideo) {
          // Video post: resumable upload to /{page_id}/videos, captioned with
          // the post text as the video description.
          const out = await uploadPageVideo({
            pageId,
            pageToken,
            videoBytes,
            contentType: videoType,
            description: text,
          });
          return { pageId, pageName, ...out };
        }

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
          // Uploading the image binary can exceed the default 15s (larger
          // photos / slow uplinks), so give it a generous per-attempt timeout
          // like the video chunks — otherwise it aborts as a false timeout.
          const res = await fetchWithRetry(
            `${GRAPH}/${pageId}/photos`,
            { method: "POST", body },
            3,
            60000
          );
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
      } catch (err) {
        // Surface the underlying reason (timeout, DNS, aborted, …) instead of a
        // generic "network_error" so failures are actually diagnosable.
        return {
          pageId,
          pageName,
          ok: false,
          error: `network_error: ${err?.name || "Error"} — ${err?.message || String(err)}`,
        };
      }
    })
  );

  return NextResponse.json({ results });
}
