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
