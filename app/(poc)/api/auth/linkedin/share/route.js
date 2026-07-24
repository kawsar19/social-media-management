import { NextResponse } from "next/server";

const LINKEDIN_VERSION = "202604";

// Publishes a post (text, optionally with one image) to LinkedIn.
// Client sends `Authorization: Bearer <token>` and multipart/form-data with
// fields: text (string) and image (File, optional).
//
// Flow:
//   1. /v2/userinfo               -> member id (sub)
//   2. if image:
//        a. /rest/images?action=initializeUpload -> { uploadUrl, image URN }
//        b. PUT uploadUrl (raw bytes)
//   3. /rest/posts                -> create the post (with content.media if image)
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const text = form?.get("text")?.toString() ?? "";
  const image = form?.get("image"); // File or null

  if (!text.trim()) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  // 1. Identify the member — author must be urn:li:person:<sub>.
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
  const owner = `urn:li:person:${me.sub}`;

  // 2. If an image was provided, upload it and get its URN.
  let imageUrn = null;
  if (image && typeof image.arrayBuffer === "function" && image.size > 0) {
    const initRes = await fetch(
      "https://api.linkedin.com/rest/images?action=initializeUpload",
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          "LinkedIn-Version": LINKEDIN_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({ initializeUploadRequest: { owner } }),
      }
    );
    const initData = await initRes.json();
    if (!initRes.ok || !initData.value?.uploadUrl) {
      return NextResponse.json(
        { error: initData.message || "image_init_failed" },
        { status: initRes.status || 502 }
      );
    }

    const bytes = await image.arrayBuffer();
    const uploadRes = await fetch(initData.value.uploadUrl, {
      method: "PUT",
      headers: { Authorization: auth },
      body: bytes,
    });
    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      return NextResponse.json(
        { error: errBody || "image_upload_failed" },
        { status: uploadRes.status }
      );
    }

    imageUrn = initData.value.image;
  }

  // 3. Create the post.
  const body = {
    author: owner,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
  };
  if (imageUrn) {
    body.content = { media: { id: imageUrn, altText: text.slice(0, 100) } };
  }

  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!postRes.ok) {
    const errBody = await postRes.text();
    return NextResponse.json(
      { error: errBody || "post_failed" },
      { status: postRes.status }
    );
  }

  const id =
    postRes.headers.get("x-restli-id") ||
    postRes.headers.get("x-linkedin-id") ||
    null;

  return NextResponse.json({ id });
}
