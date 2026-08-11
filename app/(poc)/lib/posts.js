// Client-side helpers for the Post CRUD + publish API. All calls carry the app
// JWT (same token AuthProvider stores under "social_manager_auth"), so they run
// only for a logged-in user. A Post is authored once and published to one or
// more targets; publish results live on post.targets[].

import { getAppToken } from "./socialTokens";

function authHeaders(json = false) {
  const jwt = getAppToken();
  const h = jwt ? { Authorization: `Bearer ${jwt}` } : {};
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// List the user's posts, optionally filtered by status. Returns [] when logged
// out or on error.
export async function listPosts(status) {
  if (!getAppToken()) return [];
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`/api/posts${qs}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.posts || [];
}

export async function getPost(id) {
  const res = await fetch(`/api/posts/${id}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "load_failed");
  return data.post;
}

// Create a draft/scheduled post. `post` = { content, mediaUrl?, mediaType?,
// youtubeTitle?, youtubePrivacy?, status?, scheduledAt?, targets[] }.
export async function createPost(post) {
  const res = await fetch("/api/posts", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(post),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.formErrors?.[0] || data.error || "create_failed");
  return data.post;
}

export async function updatePost(id, patch) {
  const res = await fetch(`/api/posts/${id}`, {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "update_failed");
  return data.post;
}

export async function deletePost(id) {
  const res = await fetch(`/api/posts/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "delete_failed");
  }
  return true;
}

// Publish a saved post to all its targets (server-side). Returns the updated
// post with per-target results filled in.
export async function publishPost(id) {
  const res = await fetch(`/api/posts/${id}/publish`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "publish_failed");
  return data.post;
}

// Same publish, but streamed: `onEvent` fires as each target starts and
// finishes so the UI can show live per-platform progress instead of jumping
// from "publishing" straight to the final result. Returns the updated post.
//
// The route speaks Server-Sent Events. EventSource can't be used here because
// it only issues GETs and can't send the Authorization header, so this reads
// the response body directly.
export async function publishPostStream(id, onEvent) {
  const res = await fetch(`/api/posts/${id}/publish?stream=1`, {
    method: "POST",
    headers: authHeaders(),
  });

  // Errors before the stream opens (auth, missing post) still come back as JSON.
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "publish_failed");
  }
  if (!res.body) throw new Error("no_stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPost = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line. The last piece is kept in the
    // buffer because it may be an incomplete frame.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line.slice("data: ".length));
      } catch {
        continue; // Ignore a malformed frame rather than failing the publish.
      }
      if (event.type === "error") throw new Error(event.error || "publish_failed");
      if (event.type === "done") finalPost = event.post;
      onEvent?.(event);
    }
  }

  if (!finalPost) throw new Error("stream_ended_early");
  return finalPost;
}
