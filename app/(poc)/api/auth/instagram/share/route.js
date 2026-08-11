import { NextResponse } from "next/server";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Video containers need processing time before they can be published; hint
// deployment platforms to allow the polling loop to run.
export const maxDuration = 120;

// Node's fetch (undici) sometimes hangs on graph.facebook.com and times out
// after ~10s. Retry with a bounded per-attempt timeout, mirroring the other
// Graph API routes so they all share the same resilient fetch behaviour.
async function fetchWithRetry(input, init = {}, attempts = 3, timeoutMs = 15000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Video containers are processed asynchronously. Poll status_code until the
// container is FINISHED (ready to publish) or ERROR / times out.
async function waitForContainer(containerId, token) {
  const url = new URL(`${GRAPH}/${containerId}`);
  url.searchParams.set("fields", "status_code,status");
  url.searchParams.set("access_token", token);

  // Wait up to ~100s, staying inside this route's maxDuration (120s) with room
  // to spare for the publish call that follows. A flat 3s interval spent that
  // budget in 60s and timed out on longer Reels while the container was still
  // transcoding, so the delay ramps instead: quick early polls catch short
  // videos fast, then it backs off so the same number of requests covers a much
  // longer window.
  const deadline = Date.now() + 100000;
  let delay = 2000;
  while (Date.now() < deadline) {
    const res = await fetchWithRetry(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data.error?.message || "status_check_failed" };
    }
    if (data.status_code === "FINISHED") return { ok: true };
    if (data.status_code === "ERROR") {
      return { ok: false, error: data.status || "media_processing_failed" };
    }
    // IN_PROGRESS / EXPIRED / PUBLISHED — keep waiting on IN_PROGRESS.
    // Don't sleep past the deadline; a truncated final wait is better than
    // overshooting maxDuration and having the whole request killed.
    await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    delay = Math.min(delay * 1.5, 10000);
  }
  // Still processing. The container is usually fine — Instagram just needed
  // longer than we can wait inside one request, so the video may still appear
  // on the account shortly. Say that, because a bare "timeout" reads as a
  // failure and sends people off to re-publish a post that then double-posts.
  return {
    ok: false,
    error:
      "Instagram was still processing the video after 100s. It may still publish on its own — check the account before trying again.",
  };
}

// Publishes a single photo or Reel to one Instagram Business/Creator account.
//
// Instagram's Content Publishing API can't accept raw bytes: it fetches the
// media from a public URL itself. So the client sends a URL (not a file), and
// we run the two-step create-container -> publish flow:
//   1. POST /{ig-user-id}/media       -> creation_id (container)
//        photo: image_url + caption
//        reel:  media_type=REELS + video_url + caption
//   2. (video only) poll the container until status_code === FINISHED
//   3. POST /{ig-user-id}/media_publish with creation_id -> published media id
//
// Client sends `Authorization: Bearer <facebookUserAccessToken>` (same token
// used for Pages — Instagram rides on it) and JSON:
//   igUserId  (string)  Instagram Business Account id, from /instagram/accounts
//   caption   (string, optional)
//   imageUrl  (string)  public https URL of a photo   } exactly one of these
//   videoUrl  (string)  public https URL of a video    }
export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  const body = await request.json().catch(() => null);
  const igUserId = body?.igUserId?.toString().trim();
  const caption = body?.caption?.toString() ?? "";
  const imageUrl = body?.imageUrl?.toString().trim();
  const videoUrl = body?.videoUrl?.toString().trim();

  if (!igUserId) {
    return NextResponse.json({ error: "missing_ig_account" }, { status: 400 });
  }

  const isVideo = Boolean(videoUrl);
  const mediaUrl = videoUrl || imageUrl;
  if (!mediaUrl) {
    return NextResponse.json({ error: "missing_media_url" }, { status: 400 });
  }
  if (!/^https:\/\//i.test(mediaUrl)) {
    // Instagram fetches the media from its own servers, so the URL must be a
    // public https URL — a localhost path or http URL will fail on their end.
    return NextResponse.json(
      { error: "media_url_must_be_public_https" },
      { status: 400 }
    );
  }

  try {
    // Step 1: create the media container.
    const createBody = new URLSearchParams({ access_token: token });
    if (caption) createBody.set("caption", caption);
    if (isVideo) {
      createBody.set("media_type", "REELS");
      createBody.set("video_url", videoUrl);
    } else {
      createBody.set("image_url", imageUrl);
    }

    const createRes = await fetchWithRetry(`${GRAPH}/${igUserId}/media`, {
      method: "POST",
      body: createBody,
    });
    const createData = await createRes.json();
    if (!createRes.ok || createData.error || !createData.id) {
      return NextResponse.json(
        { error: createData.error?.message || "container_create_failed" },
        { status: createRes.status === 200 ? 400 : createRes.status }
      );
    }

    const creationId = createData.id;

    // Step 2: videos process asynchronously — wait until the container is ready.
    // Photos are ready immediately, so skip the poll for them.
    if (isVideo) {
      const ready = await waitForContainer(creationId, token);
      if (!ready.ok) {
        return NextResponse.json({ error: ready.error }, { status: 400 });
      }
    }

    // Step 3: publish the container.
    const publishBody = new URLSearchParams({
      access_token: token,
      creation_id: creationId,
    });
    const publishRes = await fetchWithRetry(
      `${GRAPH}/${igUserId}/media_publish`,
      { method: "POST", body: publishBody }
    );
    const publishData = await publishRes.json();
    if (!publishRes.ok || publishData.error || !publishData.id) {
      return NextResponse.json(
        { error: publishData.error?.message || "publish_failed" },
        { status: publishRes.status === 200 ? 400 : publishRes.status }
      );
    }

    return NextResponse.json({ ok: true, id: publishData.id });
  } catch (err) {
    // Surface the underlying reason (timeout, DNS, aborted, …) instead of a
    // generic "network_error" so failures are actually diagnosable.
    return NextResponse.json(
      {
        error: `network_error: ${err?.name || "Error"} — ${
          err?.message || String(err)
        }`,
      },
      { status: 502 }
    );
  }
}
