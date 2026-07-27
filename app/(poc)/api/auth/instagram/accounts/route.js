import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";

// Node's fetch (undici) can hang on graph.facebook.com and time out after
// ~10s. Retry with a bounded per-attempt timeout. Mirrors the facebook/pages
// route so both share the same resilient fetch behaviour.
async function fetchWithRetry(input, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Instagram has no standalone login. An Instagram *Business/Creator* account is
// reached through the Facebook Page it is linked to. So we take the same
// Facebook User access token used for Pages (via `Authorization: Bearer <token>`)
// and, for every Page, read its `instagram_business_account`.
//
// Returns: { accounts: [{ id, username, name, picture, followers, pageId, pageName }] }
// where `id` is the Instagram Business Account ID used for publishing.
export async function GET(request) {
  const auth = request.headers.get("authorization");

  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const token = auth.slice("Bearer ".length);

  // One call pulls every Page plus its linked IG account and that account's
  // profile fields — avoids an N+1 request per Page.
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
  url.searchParams.set(
    "fields",
    "id,name,instagram_business_account{id,username,name,profile_picture_url,followers_count}"
  );
  url.searchParams.set("access_token", token);

  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();

  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "instagram_fetch_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  // Keep only Pages that actually have a linked Instagram account.
  const accounts = (data.data || [])
    .filter((p) => p.instagram_business_account)
    .map((p) => {
      const ig = p.instagram_business_account;
      return {
        id: ig.id,
        username: ig.username || null,
        name: ig.name || null,
        picture: ig.profile_picture_url || null,
        followers: ig.followers_count ?? null,
        pageId: p.id,
        pageName: p.name,
      };
    });

  return NextResponse.json({ accounts });
}
