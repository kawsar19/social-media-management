import { NextResponse } from "next/server";

const LINKEDIN_VERSION = "202604";

// Video uploads can take a while; hint deployment platforms to allow more time.
export const maxDuration = 299;

async function fetchWithTimeout(input, init = {}, timeoutMs = 120000) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

// Uploads a video to LinkedIn using the multipart Videos API and returns its URN.
//   1. /rest/videos?action=initializeUpload
//        -> { value.video (URN), value.uploadInstructions[{ uploadUrl, firstByte, lastByte }] }
//   2. for each instruction: PUT the byte range [firstByte, lastByte]; keep the
//        response's ETag header (LinkedIn calls these "uploadedPartIds").
//   3. /rest/videos?action=finalizeUpload  -> commits the parts to the video URN.
// Returns { ok: true, urn } or { ok: false, error }.
async function uploadLinkedInVideo({ auth, owner, video }) {
  const bytes = await video.arrayBuffer();
  const fileSizeBytes = bytes.byteLength;

  // Step 1: initialize — declare owner + size, get per-chunk upload URLs.
  const initRes = await fetchWithTimeout(
    "https://api.linkedin.com/rest/videos?action=initializeUpload",
    {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner,
          fileSizeBytes,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    }
  );
  const initData = await initRes.json().catch(() => ({}));
  const value = initData.value;
  if (!initRes.ok || !value?.video || !Array.isArray(value.uploadInstructions)) {
    return { ok: false, error: initData.message || "video_init_failed" };
  }

  // Step 2: PUT each byte range and collect the ETags in order.
  const uploadedPartIds = [];
  for (const instr of value.uploadInstructions) {
    const chunk = bytes.slice(instr.firstByte, instr.lastByte + 1);
    const putRes = await fetchWithTimeout(instr.uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": "application/octet-stream",
      },
      body: chunk,
    });
    if (!putRes.ok) {
      const errBody = await putRes.text().catch(() => "");
      return { ok: false, error: errBody || "video_chunk_upload_failed" };
    }
    const etag = putRes.headers.get("etag");
    if (!etag) {
      return { ok: false, error: "video_missing_etag" };
    }
    uploadedPartIds.push(etag);
  }

  // Step 3: finalize — commit the uploaded parts to the video URN.
  const finalizeRes = await fetchWithTimeout(
    "https://api.linkedin.com/rest/videos?action=finalizeUpload",
    {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: value.video,
          uploadToken: "",
          uploadedPartIds,
        },
      }),
    }
  );
  if (!finalizeRes.ok) {
    const errBody = await finalizeRes.text().catch(() => "");
    return { ok: false, error: errBody || "video_finalize_failed" };
  }

  return { ok: true, urn: value.video };
}

// Publishes a post (text, optionally with one image OR one video) to LinkedIn.
// Client sends `Authorization: Bearer <token>` and multipart/form-data with
// fields: text (string), image (File, optional), video (File, optional).
// A video takes precedence over an image when both are present.
//
// Flow:
//   1. /v2/userinfo               -> member id (sub)
//   2. if video: multipart upload via uploadLinkedInVideo() -> video URN
//      else if image:
//        a. /rest/images?action=initializeUpload -> { uploadUrl, image URN }
//        b. PUT uploadUrl (raw bytes)
//   3. /rest/posts                -> create the post (with content.media if media)
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const text = form?.get("text")?.toString() ?? "";
  const image = form?.get("image"); // File or null
  const video = form?.get("video"); // File or null

  const hasVideo =
    video && typeof video.arrayBuffer === "function" && video.size > 0;

  // Text is required for a plain/image post, but a video alone is a valid post.
  if (!text.trim() && !hasVideo) {
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

  // 2. Upload media (if any). A video takes precedence over an image.
  let imageUrn = null;
  let videoUrn = null;
  if (hasVideo) {
    const out = await uploadLinkedInVideo({ auth, owner, video });
    if (!out.ok) {
      return NextResponse.json({ error: out.error }, { status: 502 });
    }
    videoUrn = out.urn;
  } else if (image && typeof image.arrayBuffer === "function" && image.size > 0) {
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
  if (videoUrn) {
    body.content = { media: { id: videoUrn, title: text.slice(0, 100) || "Video" } };
  } else if (imageUrn) {
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
