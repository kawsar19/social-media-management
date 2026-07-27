import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function fetchWithRetry(input, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(15000) });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// GET /api/auth/instagram/activity?igId=<instagram_business_account_id>&since=<unixSeconds>
//
// Instagram Business accounts are reached with the Facebook *user* token (the
// same token used to publish), so the caller passes it as `Authorization:
// Bearer <fbToken>` — matching /api/auth/instagram/accounts.
//
// Returns normalized activity for the unified inbox:
//   { items: [{ id, platform:"instagram", type, author, text, timestamp,
//               permalink, context }], errors: { comments?, mentions?, messages? } }
//
// Coverage:
//  - comments: recent media, then each media's comments.
//  - mentions: /{ig}/mentioned_media (posts that @-mention the account).
//  - messages: IG DMs live under /{page}/conversations?platform=instagram and
//    need instagram_manage_messages + App Review. Reported as unsupported here
//    so the inbox can show a clear "pending permission" note rather than a
//    silent empty lane; wire it in once the app is approved.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const igId = searchParams.get("igId");
  const since = searchParams.get("since"); // unix seconds, optional
  if (!igId) {
    return NextResponse.json({ error: "missing_ig_id" }, { status: 400 });
  }

  const errors = {};
  const [comments, mentions] = await Promise.all([
    fetchComments(igId, token, since).catch((e) => {
      errors.comments = e.message || "comments_failed";
      return [];
    }),
    fetchMentions(igId, token, since).catch((e) => {
      errors.mentions = e.message || "mentions_failed";
      return [];
    }),
  ]);
  // IG DMs need App Review; surface as a known gap, not a hard error.
  errors.messages = "needs_instagram_manage_messages_app_review";

  return NextResponse.json({ items: [...comments, ...mentions], errors });
}

async function fetchComments(igId, token, since) {
  const mediaUrl = new URL(`${GRAPH}/${igId}/media`);
  mediaUrl.searchParams.set("fields", "id,caption,permalink");
  mediaUrl.searchParams.set("limit", "15");
  if (since) mediaUrl.searchParams.set("since", since);
  mediaUrl.searchParams.set("access_token", token);

  const mediaRes = await fetchWithRetry(mediaUrl, { cache: "no-store" });
  const mediaData = await mediaRes.json();
  if (!mediaRes.ok || mediaData.error) {
    throw new Error(mediaData.error?.message || "media_fetch_failed");
  }

  const media = mediaData.data || [];
  const perMedia = await Promise.all(
    media.map(async (m) => {
      const url = new URL(`${GRAPH}/${m.id}/comments`);
      url.searchParams.set("fields", "id,username,text,timestamp");
      url.searchParams.set("limit", "25");
      url.searchParams.set("access_token", token);
      const res = await fetchWithRetry(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) return [];
      const cap = (m.caption || "").slice(0, 80);
      return (data.data || []).map((c) => ({
        id: `ig_c_${c.id}`,
        platform: "instagram",
        type: "comment",
        author: c.username ? `@${c.username}` : "Instagram user",
        text: c.text || "",
        timestamp: c.timestamp || null,
        permalink: m.permalink || null,
        context: cap ? `on post: "${cap}"` : "on a post",
      }));
    })
  );
  return perMedia.flat();
}

async function fetchMentions(igId, token, since) {
  // Media in which this account is @-mentioned.
  const url = new URL(`${GRAPH}/${igId}/mentioned_media`);
  // mentioned_media returns the mentioning media; ask for its basic fields.
  url.searchParams.set("fields", "id,caption,permalink,timestamp,username");
  url.searchParams.set("limit", "25");
  if (since) url.searchParams.set("since", since);
  url.searchParams.set("access_token", token);
  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || "mentions_failed");
  }
  return (data.data || []).map((m) => ({
    id: `ig_m_${m.id}`,
    platform: "instagram",
    type: "mention",
    author: m.username ? `@${m.username}` : "Instagram user",
    text: m.caption || "",
    timestamp: m.timestamp || null,
    permalink: m.permalink || null,
    context: "mentioned you",
  }));
}
