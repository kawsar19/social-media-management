// Client-side helpers for the Autopilot automations (/api/autopilot).
// Authenticated with the app JWT, same as socialTokens.js.

import { getAppToken } from "./socialTokens";

function authHeaders() {
  const jwt = getAppToken();
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

// Every route here returns { error } with a human-readable message on failure,
// so err.message is safe to show in the UI.
async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export async function fetchAutoPosts() {
  const data = await request("/api/autopilot");
  return Array.isArray(data.autoPosts) ? data.autoPosts : [];
}

export async function createAutoPost(payload) {
  const data = await request("/api/autopilot", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.autoPost;
}

export async function updateAutoPost(id, payload) {
  const data = await request(`/api/autopilot/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.autoPost;
}

// Pause/resume. Sent as a lone `enabled` field, which the route treats as a
// toggle rather than a full update — so it needs none of the other fields.
export async function toggleAutoPost(id, enabled) {
  return updateAutoPost(id, { enabled });
}

export async function deleteAutoPost(id) {
  await request(`/api/autopilot/${id}`, { method: "DELETE" });
}

// Generate a sample post from the automation's prompt without publishing it and
// without consuming the day's scheduled run.
export async function previewAutoPost(id) {
  const data = await request(`/api/autopilot/${id}/preview`, { method: "POST" });
  return data.text || "";
}

// The user's own timezone, used as the default when creating an automation so
// "09:00" means 9am where they actually are.
export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "09:00" → "9:00 AM", for display only.
export function formatTime(timeOfDay) {
  const [h, m] = (timeOfDay || "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeOfDay || "";
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
