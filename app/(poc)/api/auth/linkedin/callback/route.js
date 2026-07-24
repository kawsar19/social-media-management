import { NextResponse } from "next/server";

// LinkedIn OAuth callback.
// LinkedIn redirects here with ?code=...  We exchange it for an access token
// (server-side, needs the client secret) and then bounce the browser back to
// /connect with the token in the URL hash so the client can save it to
// localStorage.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/connect?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/connect?error=missing_code`);
  }

  const tokenRes = await fetch(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
    }
  );

  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.access_token) {
    return NextResponse.redirect(
      `${origin}/connect?error=${encodeURIComponent(
        data.error_description || data.error || "token_exchange_failed"
      )}`
    );
  }

  // Put the token in the URL hash (not query) so it isn't sent to the server
  // on the next request. The connect page reads it and stores it.
  return NextResponse.redirect(
    `${origin}/connect#access_token=${encodeURIComponent(
      data.access_token
    )}&expires_in=${data.expires_in ?? ""}`
  );
}
