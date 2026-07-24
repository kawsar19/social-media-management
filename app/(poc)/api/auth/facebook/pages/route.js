import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";

// Node's fetch (undici) can hang on graph.facebook.com and time out after
// ~10s. Retry with a bounded per-attempt timeout.
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

// Takes a Facebook access token (User token or Page token) via
// `Authorization: Bearer <token>` and returns the Pages the token can manage.
// We call the Graph API server-side (avoids CORS) and return:
// { pages: [{ id, name, category, picture }] }
//
// A User access token returns every Page the user manages via /me/accounts.
// A Page access token typically returns just that single Page.
export async function GET(request) {
  const auth = request.headers.get("authorization");

  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const token = auth.slice("Bearer ".length);

  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
  );
  url.searchParams.set("fields", "id,name,category,picture{url}");
  url.searchParams.set("access_token", token);

  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();

  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "pages_fetch_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  const pages = (data.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    picture: p.picture?.data?.url || null,
  }));

  return NextResponse.json({ pages });
}
