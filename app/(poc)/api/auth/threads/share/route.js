import { NextResponse } from "next/server";

// Publishes a single post to Threads.
//
// Like Instagram, Threads' publishing API can't accept raw bytes for media: it
// fetches the image/video from a public URL itself. Unlike Instagram, Threads
// also supports text-only posts. The flow is the same two-step create -> publish:
//   1. POST /{threads-user-id}/threads          -> creation_id (container)
//        text:  media_type=TEXT  + text
//        image: media_type=IMAGE + image_url (+ optional text as caption)
//        video: media_type=VIDEO + video_url (+ optional text as caption)
//   2. (video only) poll the container until status === FINISHED
//   3. POST /{threads-user-id}/threads_publish with creation_id -> published id
//
// Client sends `Authorization: Bearer <threadsAccessToken>` and JSON:
//   userId   (string)  Threads user id, saved at connect time
//   text     (string)  post text / caption (required for TEXT; optional otherwise)
//   imageUrl (string)  public https URL of an image  } at most one of these;
//   videoUrl (string)  public https URL of a video   } omit both for text-only
const GRAPH = "https://graph.threads.net/v1.0";

// Video containers need processing time before they can be published; hint
// deployment platforms to allow the polling loop to run.
export const maxDuration = 120;

// Node's fetch (undici) occasionally hangs on Meta's graph hosts. Retry with a
// bounded per-attempt timeout, mirroring the Instagram/Facebook share routes.
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

// Video containers are processed asynchronously. Poll status until the
// container is FINISHED (ready to publish) or ERROR / times out. Threads
// reports readiness via the `status` field (FINISHED / IN_PROGRESS / ERROR).
async function waitForContainer(containerId, token) {
  const url = new URL(`${GRAPH}/${containerId}`);
  url.searchParams.set("fields", "status,error_message");
  url.searchParams.set("access_token", token);

  // Wait up to ~100s, staying inside this route's maxDuration with room for the
  // publish call that follows. Threads recommends ~30s before publishing a
  // video; polling for FINISHED is the reliable version of that wait. The delay
  // ramps rather than sitting at a flat 3s, so short videos are caught quickly
  // while the same number of requests still covers a long transcode.
  const deadline = Date.now() + 100000;
  let delay = 2000;
  while (Date.now() < deadline) {
    const res = await fetchWithRetry(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data.error?.message || "status_check_failed" };
    }
    if (data.status === "FINISHED") return { ok: true };
    if (data.status === "ERROR") {
      return { ok: false, error: data.error_message || "media_processing_failed" };
    }
    // IN_PROGRESS — keep waiting. Don't sleep past the deadline; a truncated
    // final wait beats overshooting maxDuration and losing the whole request.
    await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    delay = Math.min(delay * 1.5, 10000);
  }
  // Still processing — see the note in the Instagram route: this is a wait that
  // ran out, not a rejected video, so don't word it as an outright failure.
  return {
    ok: false,
    error:
      "Threads was still processing the video after 100s. It may still publish on its own — check the account before trying again.",
  };
}

export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  const body = await request.json().catch(() => null);
  // The Threads user id is optional: the token already identifies the account,
  // so we can address it as `/me` when no id is saved (this is how the Meta
  // Postman collection does it). A saved id still works — either is accepted.
  const userId = body?.userId?.toString().trim() || "me";
  const text = body?.text?.toString() ?? "";
  const imageUrl = body?.imageUrl?.toString().trim();
  const videoUrl = body?.videoUrl?.toString().trim();

  const isVideo = Boolean(videoUrl);
  const isImage = !isVideo && Boolean(imageUrl);
  const mediaUrl = videoUrl || imageUrl;

  // Text-only posts are valid on Threads, but a post with neither media nor
  // text is not.
  if (!mediaUrl && !text.trim()) {
    return NextResponse.json({ error: "empty_post" }, { status: 400 });
  }
  if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) {
    // Threads fetches the media from its own servers, so the URL must be a
    // public https URL — a localhost path or http URL will fail on their end.
    return NextResponse.json(
      { error: "media_url_must_be_public_https" },
      { status: 400 }
    );
  }

  try {
    // Step 1: create the media container. The media_type drives which fields
    // are read; text rides along as the caption for image/video posts.
    const createBody = new URLSearchParams({ access_token: token });
    if (isVideo) {
      createBody.set("media_type", "VIDEO");
      createBody.set("video_url", videoUrl);
      if (text) createBody.set("text", text);
    } else if (isImage) {
      createBody.set("media_type", "IMAGE");
      createBody.set("image_url", imageUrl);
      if (text) createBody.set("text", text);
    } else {
      createBody.set("media_type", "TEXT");
      createBody.set("text", text);
    }

    const createRes = await fetchWithRetry(`${GRAPH}/${userId}/threads`, {
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
    // Text and images are ready right away, so skip the poll for them.
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
      `${GRAPH}/${userId}/threads_publish`,
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
