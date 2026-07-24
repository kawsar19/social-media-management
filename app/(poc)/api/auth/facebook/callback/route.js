import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";

// Facebook OAuth callback.
// Facebook redirects here with ?code=...  We exchange it for a user access
// token (server-side, needs the App Secret) and then bounce the browser back
// to /connect with the token in the URL hash so the client can save it to
// localStorage. Mirrors the LinkedIn callback flow.
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

  const tokenUrl = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
  );
  tokenUrl.searchParams.set("client_id", process.env.FACEBOOK_APP_ID);
  tokenUrl.searchParams.set("client_secret", process.env.FACEBOOK_APP_SECRET);
  tokenUrl.searchParams.set("redirect_uri", process.env.FACEBOOK_REDIRECT_URI);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl, { cache: "no-store" });
  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.access_token) {
    return NextResponse.redirect(
      `${origin}/connect?error=${encodeURIComponent(
        data.error?.message || "token_exchange_failed"
      )}`
    );
  }

  // Return the token under fb_access_token so the connect page can tell it
  // apart from LinkedIn's access_token. Hash keeps it out of server logs.
  return NextResponse.redirect(
    `${origin}/connect#fb_access_token=${encodeURIComponent(
      data.access_token
    )}&expires_in=${data.expires_in ?? ""}`
  );
}
