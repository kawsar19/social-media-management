import SocialAccount from "@/lib/models/SocialAccount";
import { deleteFromR2, r2KeyFromUrl } from "@/lib/r2";

// Server-side helpers for publishing a saved Post to each social platform.
//
// The browser helpers in lib/socialTokens.js are window-only, so the server
// reads the SocialAccount collection directly to get each platform's token, and
// refreshes YouTube's ~1h access token the same way /api/auth/youtube/token
// does. File-upload platforms (LinkedIn/Facebook/YouTube) need the raw media
// bytes, so we download the staged R2 URL into a Blob on demand.

const EXPIRY_SKEW_MS = 60 * 1000;

// Return a valid access token for a platform account, refreshing YouTube's when
// it has expired. Returns null if there's no account or no usable token.
export async function resolvePlatformToken(userId: string, platform: string) {
  const account = await SocialAccount.findOne({ userId, platform });
  if (!account) return { token: null, account: null };

  if (platform !== "youtube") {
    return { token: account.accessToken, account };
  }

  // YouTube: refresh if the access token has (nearly) expired.
  const now = Date.now();
  const expiresAtMs = account.expiresAt ? new Date(account.expiresAt).getTime() : 0;
  const stillValid = expiresAtMs - EXPIRY_SKEW_MS > now;
  if (stillValid) return { token: account.accessToken, account };

  if (!account.refreshToken) return { token: null, account };

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await refreshRes.json().catch(() => ({}));
  if (!refreshRes.ok || !data.access_token) {
    return { token: null, account };
  }

  account.accessToken = data.access_token;
  account.expiresAt = new Date(now + (data.expires_in ?? 3600) * 1000);
  if (data.refresh_token) account.refreshToken = data.refresh_token;
  await account.save();
  return { token: account.accessToken, account };
}

// Download the stored media URL into a Blob so it can be re-uploaded to
// platforms that require raw bytes. Returns null on any failure.
export async function fetchMediaBlob(mediaUrl?: string) {
  if (!mediaUrl) return null;
  try {
    const res = await fetch(mediaUrl, { cache: "no-store" });
    if (!res.ok) {
      // Silence here would surface downstream as an unexplained per-platform
      // failure, so say which URL failed and why.
      console.error(`[publish] media fetch ${res.status} for ${mediaUrl}`);
      return null;
    }
    return await res.blob();
  } catch (err) {
    console.error(`[publish] media fetch threw for ${mediaUrl}:`, err);
    return null;
  }
}

// How long to leave the staged media in R2 after publishing finishes.
//
// Instagram and Threads fetch the media themselves, and their share routes
// return as soon as the container is created — the actual fetch can still be in
// flight. Deleting immediately would race that fetch and show up as a failed
// post on their side, so we hold the object for a few minutes first.
const MEDIA_CLEANUP_DELAY_MS = 3 * 60 * 1000;

// Delete a post's staged R2 video once the platforms have had time to fetch it.
// Call inside Next's `after()` so it runs off the response — the delay is
// bounded by the route's maxDuration.
//
// Videos only: they're what actually costs storage, and every platform either
// re-hosts the file or holds its own copy after publishing. Images are kept so
// the saved post still renders a preview on /profile/posts — deleting them
// would leave every published post with a broken thumbnail.
//
// Only deletes objects under our own R2 public base (r2KeyFromUrl returns null
// for anything else), so a post whose mediaUrl points somewhere external is
// left alone. Never throws: cleanup is best-effort and must not affect an
// already-completed publish. Objects that survive a cold start or timeout are
// swept by the bucket's lifecycle rule.
export async function scheduleMediaCleanup(
  mediaUrl?: string,
  mediaType?: string
) {
  if (mediaType !== "video") return;
  const key = r2KeyFromUrl(mediaUrl);
  if (!key) return;

  await new Promise((resolve) => setTimeout(resolve, MEDIA_CLEANUP_DELAY_MS));
  const deleted = await deleteFromR2(key);
  if (deleted) console.log("[r2] cleaned up staged video", key);
}

// Build a public permalink for a published post where the platform id lets us
// derive one. Returns undefined when no clean URL is derivable.
export function permalinkFor(
  platform: string,
  platformPostId?: string,
  destinationName?: string
): string | undefined {
  if (!platformPostId && platform !== "instagram") return undefined;
  switch (platform) {
    case "youtube":
      return `https://youtube.com/watch?v=${platformPostId}`;
    case "facebook":
      // post_id is usually "<pageId>_<postId>"; the feed permalink works with it.
      return `https://facebook.com/${platformPostId}`;
    case "threads":
      return `https://threads.net/@${destinationName || ""}`.replace("@@", "@");
    default:
      return undefined;
  }
}
