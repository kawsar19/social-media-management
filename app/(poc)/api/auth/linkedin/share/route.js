import { NextResponse } from "next/server";

// Publishes a text post to LinkedIn on behalf of the logged-in member.
// Client sends `Authorization: Bearer <token>` and JSON body { text }.
// We look up the member id via /v2/userinfo (sub), then create the post
// through the current Posts API (/rest/posts).
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const { text } = await request.json().catch(() => ({}));
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  // 1. Get the member id (sub) — the post author must be urn:li:person:<sub>.
  const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: auth },
  });
  const me = await meRes.json();
  if (!meRes.ok || !me.sub) {
    return NextResponse.json(
      { error: me.message || "failed_to_identify_member" },
      { status: meRes.status || 502 }
    );
  }

  // 2. Create the post.
  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202604",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: `urn:li:person:${me.sub}`,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
    }),
  });

  if (!postRes.ok) {
    const errBody = await postRes.text();
    return NextResponse.json(
      { error: errBody || "post_failed" },
      { status: postRes.status }
    );
  }

  // LinkedIn returns the new post URN in the x-restli-id / x-linkedin-id header.
  const id =
    postRes.headers.get("x-restli-id") ||
    postRes.headers.get("x-linkedin-id") ||
    null;

  return NextResponse.json({ id });
}
