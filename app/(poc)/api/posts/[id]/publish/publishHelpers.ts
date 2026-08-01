import SocialAccount from "@/lib/models/SocialAccount";

// Server-side helpers for publishing a saved Post to each social platform.
//
// The browser helpers in lib/socialTokens.js are window-only, so the server
// reads the SocialAccount collection directly to get each platform's token, and
// refreshes YouTube's ~1h access token the same way /api/auth/youtube/token
// does. File-upload platforms (LinkedIn/Facebook/YouTube) need the raw media
// bytes, so we download the stored Cloudinary URL into a Blob on demand.

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
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
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
