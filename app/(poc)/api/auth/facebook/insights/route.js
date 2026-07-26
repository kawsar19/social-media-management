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

// Resolve a Page's own access token from the user's managed Pages.
async function getPageToken(userToken, pageId) {
  const url = new URL(`${GRAPH}/me/accounts`);
  url.searchParams.set(
    "fields",
    "id,name,fan_count,followers_count,access_token"
  );
  url.searchParams.set("access_token", userToken);
  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return { error: data.error?.message || "failed_to_load_pages" };
  }
  const page = (data.data || []).find((p) => p.id === pageId);
  if (!page) return { error: "page_not_found" };
  return { token: page.access_token, page };
}

// GET /api/auth/facebook/insights?pageId=<id>
// Returns Page-level stats plus per-post engagement for recent posts:
// { page: { name, fanCount, followers }, posts: [{ id, message, createdTime,
//   permalink, likes, comments, shares, reach }] }
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const userToken = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId");
  if (!pageId) {
    return NextResponse.json({ error: "missing_page_id" }, { status: 400 });
  }

  const {
    token: pageToken,
    page,
    error: tokenError,
  } = await getPageToken(userToken, pageId);
  if (tokenError) {
    return NextResponse.json({ error: tokenError }, { status: 400 });
  }

  // Fetch recent posts with engagement counts.
  // - likes.summary / comments.summary / shares give the counts
  // Reach is fetched separately per-post below: nesting
  // insights.metric(...) on the /feed edge fails with error (#100) as soon
  // as a single post in the feed can't serve that metric (e.g. shared/link
  // posts), which takes down the whole request.
  const url = new URL(`${GRAPH}/${pageId}/feed`);
  url.searchParams.set(
    "fields",
    [
      "id",
      "message",
      "created_time",
      "permalink_url",
      "shares",
      "likes.summary(true).limit(0)",
      "comments.summary(true).limit(0)",
    ].join(",")
  );
  url.searchParams.set("limit", "25");
  url.searchParams.set("access_token", pageToken);

  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message || "insights_fetch_failed" },
      { status: res.status === 200 ? 400 : res.status }
    );
  }

  const rawPosts = data.data || [];

  // Fetch reach per post independently so one unsupported post doesn't fail
  // the batch. Returns null when the metric isn't available for that post.
  const reachByPost = await Promise.all(
    rawPosts.map(async (p) => {
      const insUrl = new URL(`${GRAPH}/${p.id}/insights`);
      insUrl.searchParams.set("metric", "post_impressions_unique");
      insUrl.searchParams.set("access_token", pageToken);
      try {
        const insRes = await fetchWithRetry(insUrl, { cache: "no-store" });
        const insData = await insRes.json();
        if (!insRes.ok || insData.error) return null;
        const metric = (insData.data || []).find(
          (i) => i.name === "post_impressions_unique"
        );
        return metric?.values?.[0]?.value ?? null;
      } catch {
        return null;
      }
    })
  );

  const posts = rawPosts.map((p, idx) => ({
    id: p.id,
    message: p.message || null,
    createdTime: p.created_time || null,
    permalink: p.permalink_url || null,
    likes: p.likes?.summary?.total_count ?? 0,
    comments: p.comments?.summary?.total_count ?? 0,
    shares: p.shares?.count ?? 0,
    reach: reachByPost[idx],
  }));

  return NextResponse.json({
    page: {
      name: page.name,
      fanCount: page.fan_count ?? null,
      followers: page.followers_count ?? null,
    },
    posts,
  });
}
