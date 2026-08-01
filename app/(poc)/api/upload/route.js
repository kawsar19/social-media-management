import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";

// POST /api/upload
// Auth: Bearer <app JWT> (from AuthProvider — only logged-in users may upload).
//
// Takes a multipart form with a single `file` (image or video) and uploads it
// to Cloudinary, returning a public https URL. Instagram and Threads can't
// accept uploaded files directly — they fetch media by URL — so this is what
// turns a local file pick into a URL those platforms can consume.
//
// Response: { url, resourceType } or { error } with an HTTP status.

// Videos can take a while to finish uploading/processing on Cloudinary's side.
export const maxDuration = 120;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return NextResponse.json(
      { error: "cloudinary_not_configured" },
      { status: 500 }
    );
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

  // Cloudinary picks image vs video handling from resource_type; "auto" lets it
  // detect from the bytes so the same route handles both.
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { resource_type: "auto", folder: "social-manager" },
          (error, res) => (error ? reject(error) : resolve(res))
        )
        .end(bytes);
    });

    return NextResponse.json({
      url: result.secure_url,
      resourceType: result.resource_type, // "image" | "video"
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "upload_failed" },
      { status: 502 }
    );
  }
}
