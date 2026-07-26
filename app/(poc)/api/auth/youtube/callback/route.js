import { NextResponse } from "next/server";

// YouTube (Google) OAuth callback.
// Google redirects here with ?code=...  We exchange it for an access token
// server-side (needs the Client Secret) and bounce the browser back to
// /connect with the token in the URL hash so the client can save it to
// localStorage. Mirrors the Facebook callback flow.
//
// Note (POC): Google access tokens expire in ~1 hour and we do NOT persist the
// refresh token here, so the user re-connects when it expires. That keeps this
// consistent with the Facebook/LinkedIn flow. To keep sessions alive long-term
// you'd store the refresh_token in an httpOnly cookie and refresh server-side.
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

  // Exchange the authorization code for an access token. Unlike Facebook this
  // is a POST with form-encoded params.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.access_token) {
    return NextResponse.redirect(
      `${origin}/connect?error=${encodeURIComponent(
        data.error_description || data.error || "token_exchange_failed"
      )}`
    );
  }

  // Return the token under yt_access_token so the connect page can tell it
  // apart from Facebook/LinkedIn tokens. Hash keeps it out of server logs.
  return NextResponse.redirect(
    `${origin}/connect#yt_access_token=${encodeURIComponent(
      data.access_token
    )}&expires_in=${data.expires_in ?? ""}`
  );
}
