import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { isR2Configured, createPresignedUpload } from "@/lib/r2";

// POST /api/upload
// Auth: Bearer <app JWT> (from AuthProvider — only logged-in users may upload).
//
// Hands back a short-lived URL the browser can PUT a file straight to in
// Cloudflare R2, plus the public https URL that file will have once it lands.
// Instagram and Threads can't accept an uploaded file — they fetch media by URL
// — so this is what turns a local file pick into a URL those platforms can
// consume.
//
// The file itself never passes through this route. It used to, and that put a
// 100 MB video inside one serverless request: past the platform's request-size
// cap, and long enough to run into its duration cap. Signing a URL keeps this
// request small and fast whatever the file weighs, and the transfer becomes a
// direct browser-to-R2 PUT.
//
// Videos are staging only: once the post has been published, the publish route
// deletes them from R2. Images stay so the saved post keeps a preview (see
// scheduleMediaCleanup in the publish route's helpers).
//
// Request:  { filename?, contentType? }
// Response: { uploadUrl, url, key, resourceType } or { error } with a status.
//
// Note: R2 needs a CORS rule allowing PUT from this app's origin, or the
// browser blocks the direct upload before it starts.

function getUser(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export async function POST(request) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: "r2_not_configured" }, { status: 500 });
  }

  const user = getUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const filename =
    typeof body.filename === "string" ? body.filename : undefined;
  const contentType =
    typeof body.contentType === "string" ? body.contentType : undefined;

  try {
    const presigned = await createPresignedUpload({
      userId: user.userId,
      filename,
      contentType,
    });
    return NextResponse.json(presigned);
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "presign_failed" },
      { status: 502 }
    );
  }
}
