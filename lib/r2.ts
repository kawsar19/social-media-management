import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// Cloudflare R2 (S3-compatible) media hosting.
//
// Instagram and Threads can't accept an uploaded file — they fetch media by
// URL — so a picked/generated file has to live at a public https URL before it
// can be published. We put it in R2, publish from the resulting pub-xxx.r2.dev
// URL, then delete the object once every platform has fetched it. R2 is only a
// staging area for a publish, never permanent storage.

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;
// Trailing slash would double up when we join it with the key.
const PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");

export function isR2Configured() {
  return Boolean(
    ACCOUNT_ID &&
      ACCESS_KEY_ID &&
      SECRET_ACCESS_KEY &&
      BUCKET &&
      PUBLIC_BASE_URL
  );
}

// One client per process. R2 ignores the region but the SDK requires one, and
// "auto" is what Cloudflare documents for S3-compatible clients.
let client: S3Client | null = null;
function getClient() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID!,
        secretAccessKey: SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

// Keep only characters that are safe in a URL path, so the public r2.dev link
// doesn't need escaping and stays readable.
function safeExtension(filename?: string) {
  const ext = filename?.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1];
  return ext ? `.${ext.toLowerCase()}` : "";
}

// Object keys are namespaced per user so one user's publish can never collide
// with (or be deleted by) another's. The random suffix keeps two uploads of the
// same filename apart.
function buildKey(userId: string, filename?: string) {
  const rand = crypto.randomUUID();
  return `uploads/${userId}/${Date.now()}-${rand}${safeExtension(filename)}`;
}

export type R2Upload = {
  url: string;
  key: string;
  resourceType: "image" | "video";
};

// Each multipart chunk is held in memory while it uploads, so this trades peak
// memory against part count. 8 MB keeps a large video well under a few hundred
// MB of buffers while staying far below S3's 10,000-part ceiling.
const PART_SIZE = 8 * 1024 * 1024;

// Upload a file and return the public URL plus the key needed to delete it
// later. `body` may be a Buffer or a stream — a large video must be streamed,
// since buffering one whole (`arrayBuffer()`) stalls the request long enough to
// look like a hang.
export async function uploadToR2(
  body: Buffer | ReadableStream | NodeJS.ReadableStream,
  {
    userId,
    filename,
    contentType,
  }: { userId: string; filename?: string; contentType?: string }
): Promise<R2Upload> {
  const key = buildKey(userId, filename);
  const type = contentType || "application/octet-stream";

  // Upload (from lib-storage) does multipart when the body is large enough and
  // a single PutObject otherwise, so both paths go through one call.
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: body as any,
      ContentType: type,
    },
    partSize: PART_SIZE,
    queueSize: 4, // parts in flight; 4 saturates a typical link without hoarding memory
  });
  await upload.done();

  return {
    url: `${PUBLIC_BASE_URL}/${key}`,
    key,
    resourceType: type.startsWith("video/") ? "video" : "image",
  };
}

// Delete a staged object. Never throws: cleanup failing must not turn an
// already-successful publish into an error. Returns whether it went through so
// callers can log the outcome.
export async function deleteFromR2(key: string): Promise<boolean> {
  if (!key || !isR2Configured()) return false;
  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
    );
    return true;
  } catch (err) {
    console.error("[r2] failed to delete", key, err);
    return false;
  }
}

// Recover the object key from a stored public URL. Posts persist mediaUrl (not
// the key), so cleanup for a saved post has to work back from the URL. Returns
// null for anything that isn't one of our own R2 URLs — that guard is what
// keeps this from deleting by a URL an attacker supplied.
export function r2KeyFromUrl(mediaUrl?: string): string | null {
  if (!mediaUrl || !PUBLIC_BASE_URL) return null;
  if (!mediaUrl.startsWith(`${PUBLIC_BASE_URL}/`)) return null;
  const key = mediaUrl.slice(PUBLIC_BASE_URL.length + 1);
  return key.startsWith("uploads/") ? key : null;
}
