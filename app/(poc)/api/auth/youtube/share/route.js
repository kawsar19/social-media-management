import { NextResponse } from "next/server";

// Resumable upload endpoint for YouTube videos. uploadType=resumable does the
// two-step flow: (1) POST metadata to open a session, (2) PUT the bytes to the
// session URL returned in the Location header.
const YT_UPLOAD =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

// Video uploads can take a while; hint deployment platforms to allow more time.
export const maxDuration = 299;

async function fetchWithRetry(input, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(120000) });
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
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  const form = await request.formData().catch(() => null);
  const video = form?.get("video");
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

  // Step 2: upload the bytes to the session URL.
  let upRes;
  try {
    upRes = await fetchWithRetry(sessionUrl, {
      method: "PUT",
      cache: "no-store",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
      },
      body: bytes,
    });
  } catch {
    return NextResponse.json({ error: "upload_network_error" }, { status: 502 });
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
