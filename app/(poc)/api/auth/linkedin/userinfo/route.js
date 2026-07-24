import { NextResponse } from "next/server";

// Proxies LinkedIn's OpenID userinfo endpoint.
// The client sends its saved access token as `Authorization: Bearer <token>`;
// we call LinkedIn server-side (avoids CORS) and return the profile JSON:
// { sub, name, given_name, family_name, email, email_verified, picture }
export async function GET(request) {
  const auth = request.headers.get("authorization");

  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: auth },
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: data.message || "userinfo_failed" },
      { status: res.status }
    );
  }

  return NextResponse.json(data);
}
