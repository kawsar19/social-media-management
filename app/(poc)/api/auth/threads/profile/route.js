import { NextResponse } from "next/server";

// Threads profile proxy.
// The connect page calls this with the saved Threads token to confirm the
// connection and show who's connected — same role as the LinkedIn /userinfo
// and YouTube /channel proxies. Returns the Threads user's id, username, and
// profile picture. Keeping it server-side means the token isn't handed to
// graph.threads.net from the browser.
const GRAPH = "https://graph.threads.net/v1.0";

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  const url = new URL(`${GRAPH}/me`);
  url.searchParams.set(
    "fields",
    "id,username,name,threads_profile_picture_url"
  );
  url.searchParams.set("access_token", token);

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: data.error?.message || "failed_to_load_profile" },
        { status: res.status === 200 ? 400 : res.status }
      );
    }

    return NextResponse.json({
      id: data.id,
      username: data.username,
      name: data.name,
      picture: data.threads_profile_picture_url || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `network_error: ${err?.message || String(err)}` },
      { status: 502 }
    );
  }
}
