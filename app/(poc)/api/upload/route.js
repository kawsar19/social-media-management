import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { isR2Configured, uploadToR2 } from "@/lib/r2";

// POST /api/upload
// Auth: Bearer <app JWT> (from AuthProvider — only logged-in users may upload).
//
// Takes a multipart form with a single `file` (image or video) and uploads it
// to Cloudflare R2, returning its public https URL. Instagram and Threads can't
// accept uploaded files directly — they fetch media by URL — so this is what
// turns a local file pick into a URL those platforms can consume.
//
// Videos are staging only: once the post has been published, the publish route
// deletes them from R2. Images stay so the saved post keeps a preview (see
// scheduleMediaCleanup in the publish route's helpers).
//
// Response: { url, key, resourceType } or { error } with an HTTP status.

// Bound by the user's upload bandwidth, not by us: 200 MB over a ~5 Mbps link
// takes about 6 minutes, and the browser gets no response until R2 has it all.
export const maxDuration = 900;

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

  const form = await request.formData().catch(() => null);
  const file = form?.get("file"); // File or null
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  try {
    // Stream the file straight through to R2. Reading it into a Buffer first
    // (via arrayBuffer()) holds the whole video in memory and stalls the
    // request — a 200 MB upload never returned.
    const { url, key, resourceType } = await uploadToR2(file.stream(), {
      userId: user.userId,
      filename: file.name,
      contentType: file.type,
    });
    return NextResponse.json({ url, key, resourceType });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "upload_failed" },
      { status: 502 }
    );
  }
}
