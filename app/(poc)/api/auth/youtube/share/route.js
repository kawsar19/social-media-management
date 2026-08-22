import { NextResponse } from "next/server";
import { resolveMediaFile } from "@/app/(poc)/api/posts/[id]/publish/publishHelpers";

// Resumable upload endpoint for YouTube videos. uploadType=resumable does the
// two-step flow: (1) POST metadata to open a session, (2) PUT the bytes to the
// session URL returned in the Location header.
const YT_UPLOAD =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

// Video uploads can take a while; hint deployment platforms to allow more time.
export const maxDuration = 299;

// Budget for the whole handler, well under maxDuration so a slow upload returns
// a real error instead of the platform killing the function mid-response. When
// that happened the publish route's SSE stream died with it and the UI could
// only report "Interrupted", with nothing to act on.
//
// The margin is large because this route is usually called BY the publish
// route, which is itself capped at 299s and is waiting on this response. Both
// share one wall clock, so this has to finish early enough for the caller to
// record the result and close its stream cleanly.
const TOTAL_BUDGET_MS = 240_000;

// Opening the session is a small JSON round-trip; it has no business consuming
// the budget the bytes need.
const INIT_TIMEOUT_MS = 30_000;

// Retries the *session open* only — a cheap, idempotent request. The upload PUT
// is deliberately not retried: a request that reached YouTube but whose response
// was lost would upload the video a second time. (A production version would
// resume the existing session by querying its byte offset instead of resending.)
async function fetchWithRetry(input, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(INIT_TIMEOUT_MS),
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const PRIVACY = new Set(["public", "unlisted", "private"]);

// POST /api/auth/youtube/share
// Auth: Bearer <youtube_access_token> (needs the youtube.upload scope).
// multipart/form-data:
//   video        (File, required)
//   title        (string, required)
//   description  (string, optional)
//   privacy      ("public" | "unlisted" | "private", default "private")
// Returns: { ok, id, title, privacyStatus, uploadStatus }
export async function POST(request) {
  // Anchors the budget: downloading the video from R2 and opening the session
  // both happen before the PUT, and both eat into the time it has left.
  const startedAt = Date.now();

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  const form = await request.formData().catch(() => null);
  // Either a posted File or, when the caller sent a `mediaUrl`, bytes fetched
  // from R2 here — see resolveMediaFile for why the publish route sends a URL.
  const video = await resolveMediaFile(form, "video");
  const title = form?.get("title")?.toString().trim() ?? "";
  const description = form?.get("description")?.toString() ?? "";
  let privacy = form?.get("privacy")?.toString() ?? "private";
  if (!PRIVACY.has(privacy)) privacy = "private";

  if (!title) {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }
  const hasVideo =
    video && typeof video.arrayBuffer === "function" && video.size > 0;
  if (!hasVideo) {
    return NextResponse.json({ error: "video_required" }, { status: 400 });
  }

  const bytes = await video.arrayBuffer();
  const contentType = video.type || "video/*";

  // Step 1: open a resumable session. The metadata goes in the JSON body; the
  // upcoming media's type/length are declared via X-Upload-Content-* headers.
  let initRes;
  try {
    initRes = await fetchWithRetry(YT_UPLOAD, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(bytes.byteLength),
      },
      body: JSON.stringify({
        snippet: { title, description },
        status: { privacyStatus: privacy },
      }),
    });
  } catch {
    return NextResponse.json({ error: "network_error" }, { status: 502 });
  }

  if (!initRes.ok) {
    const data = await initRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error?.message || "upload_init_failed" },
      { status: initRes.status }
    );
  }

  const sessionUrl = initRes.headers.get("location");
  if (!sessionUrl) {
    return NextResponse.json(
      { error: "no_upload_session_url" },
      { status: 502 }
    );
  }

  // Step 2: upload the bytes to the session URL. One attempt, with whatever is
  // left of the budget — see fetchWithRetry's note on why this isn't retried.
  const remainingMs = TOTAL_BUDGET_MS - (Date.now() - startedAt);
  if (remainingMs <= 0) {
    return NextResponse.json({ error: "upload_timeout" }, { status: 504 });
  }

  let upRes;
  try {
    upRes = await fetch(sessionUrl, {
      method: "PUT",
      cache: "no-store",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
      },
      body: bytes,
      signal: AbortSignal.timeout(remainingMs),
    });
  } catch (err) {
    // A timeout here means the video was too large to push within the budget,
    // which is a different problem from the network failing — and the only one
    // the user can act on (upload a shorter/smaller video).
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? `Upload didn't finish in time (${Math.round(
              bytes.byteLength / (1024 * 1024)
            )} MB). Try a smaller or shorter video.`
          : "upload_network_error",
      },
      { status: timedOut ? 504 : 502 }
    );
  }

  const data = await upRes.json().catch(() => ({}));
  if (!upRes.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "upload_failed" },
      { status: upRes.status === 200 ? 400 : upRes.status }
    );
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    title: data.snippet?.title || title,
    privacyStatus: data.status?.privacyStatus || privacy,
    uploadStatus: data.status?.uploadStatus || null,
  });
}
