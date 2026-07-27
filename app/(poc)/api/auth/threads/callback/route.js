import { NextResponse } from "next/server";

// Threads OAuth callback.
// Threads (Meta, but a separate app from Facebook) redirects here with ?code=...
// We exchange it server-side for a short-lived token, then immediately upgrade
// that to a long-lived (~60-day) token so the POC token doesn't expire in an
// hour. The bounce back to /connect carries the token + the Threads user id in
// the URL hash so the client can save both to localStorage. Mirrors the
// Facebook/LinkedIn callbacks, with Threads' own hosts and grant types.
const GRAPH = "https://graph.threads.net";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error =
    searchParams.get("error_description") || searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/connect?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/connect?error=missing_code`);
  }

  // Step 1: exchange the code for a short-lived access token. Threads returns
  // the token together with user_id, so we don't need a separate /me call to
  // learn which account we're publishing as.
  const shortRes = await fetch(`${GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.THREADS_APP_ID,
      client_secret: process.env.THREADS_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: process.env.THREADS_REDIRECT_URI,
      code,
    }),
    cache: "no-store",
  });
  const shortData = await shortRes.json();

  if (!shortRes.ok || !shortData.access_token) {
    return NextResponse.redirect(
      `${origin}/connect?error=${encodeURIComponent(
        shortData.error_message ||
          shortData.error?.message ||
          "token_exchange_failed"
      )}`
    );
  }

  const userId = shortData.user_id;

  // Step 2: upgrade the short-lived token (valid ~1h) to a long-lived one
  // (valid ~60 days). This is a GET with grant_type=th_exchange_token. If it
  // fails we still fall back to the short-lived token so the connection works.
  let accessToken = shortData.access_token;
  let expiresIn = 3600;
  try {
    const longUrl = new URL(`${GRAPH}/access_token`);
    longUrl.searchParams.set("grant_type", "th_exchange_token");
    longUrl.searchParams.set("client_secret", process.env.THREADS_APP_SECRET);
    longUrl.searchParams.set("access_token", shortData.access_token);

    const longRes = await fetch(longUrl, { cache: "no-store" });
    const longData = await longRes.json();
    if (longRes.ok && longData.access_token) {
      accessToken = longData.access_token;
      expiresIn = longData.expires_in ?? expiresIn;
    }
  } catch {
    // Keep the short-lived token — the connection still works, just briefly.
  }

  // Put the token (and Threads user id) in the URL hash so they aren't sent to
  // the server on the next request. The connect page reads and stores them.
  return NextResponse.redirect(
    `${origin}/connect#threads_access_token=${encodeURIComponent(
      accessToken
    )}&threads_user_id=${encodeURIComponent(
      userId ?? ""
    )}&expires_in=${expiresIn}`
  );
}
