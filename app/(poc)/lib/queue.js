// Client-side helpers for the scheduled-post queue.
//
// A queued post is just a Post with status "scheduled" and a scheduledAt — the
// same records the composer and Saved Posts already deal with. So this file
// holds no CRUD of its own; it builds on lib/posts.js and adds only what the
// queue view needs: fetching the scheduled ones, moving one's time, and the
// date/time <-> Date conversions the form inputs require.

import { listPosts, updatePost, deletePost, createPost } from "./posts";

// Every scheduled post, soonest first — the order they'll actually go out.
// listPosts sorts newest-created first, which is the wrong axis here: a post
// added last can be scheduled first.
export async function fetchQueue() {
  const posts = await listPosts("scheduled");
  return posts.sort(
    (a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0)
  );
}

// Posts that were queued and have since run, newest first. Kept separate from
// the queue itself so the upcoming list stays a list of things still to happen.
export async function fetchQueueHistory() {
  const [published, partial, failed] = await Promise.all([
    listPosts("published"),
    listPosts("partial"),
    listPosts("failed"),
  ]);
  return [...published, ...partial, ...failed]
    .filter((p) => p.scheduledAt)
    .sort((a, b) => new Date(b.scheduledAt || 0) - new Date(a.scheduledAt || 0));
}

export async function scheduleNewPost(payload, scheduledAt) {
  return createPost({
    ...payload,
    status: "scheduled",
    scheduledAt: scheduledAt.toISOString(),
  });
}

// Move a queued post to a different moment.
export async function rescheduleAt(id, scheduledAt) {
  return updatePost(id, { scheduledAt: scheduledAt.toISOString() });
}

export async function updateQueuedPost(id, patch) {
  return updatePost(id, patch);
}

// Pull a post out of the queue without deleting it — it goes back to being a
// draft, so the writing isn't lost just because the timing changed.
export async function unschedulePost(id) {
  return updatePost(id, { status: "draft", scheduledAt: null });
}

export async function removeQueuedPost(id) {
  return deletePost(id);
}

// ── date/time plumbing ──────────────────────────────────────────────────────
//
// <input type="date"> and <input type="time"> speak local wall-clock strings,
// while scheduledAt is an instant. These convert between the two in the
// browser's own zone, which is what the user means when they type "9:00".

export function toDateInput(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  // Built from the local parts rather than toISOString(), which would shift to
  // UTC and show the previous day for anyone east of Greenwich after midnight.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function toTimeInput(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

// "2026-08-22" + "09:00" → a Date in the browser's zone. Returns null on
// anything unparseable so a caller can refuse to save rather than queue a post
// for the epoch.
export function fromDateTimeInputs(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

// "Fri, 22 Aug · 9:00 AM" — compact enough for a dense queue row.
export function formatSlot(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "in 3 hours" / "2 days ago", for the at-a-glance column. Falls back to an
// empty string rather than guessing when the date is unusable.
export function relativeToNow(date, now = new Date()) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = d.getTime() - now.getTime();
  const abs = Math.abs(diffMs);

  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < HOUR) return rtf.format(Math.round(diffMs / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), "hour");
  return rtf.format(Math.round(diffMs / DAY), "day");
}

// Group queued posts by local calendar day, preserving the sorted order, so the
// list can show day headings instead of 30 undifferentiated rows.
export function groupByDay(posts) {
  const groups = [];
  for (const post of posts) {
    const key = toDateInput(post.scheduledAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.posts.push(post);
    else groups.push({ key, posts: [post] });
  }
  return groups;
}

// A heading a person can scan: "Today", "Tomorrow", then the date.
export function dayLabel(key, now = new Date()) {
  if (!key) return "Unscheduled";
  const today = toDateInput(now);
  if (key === today) return "Today";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === toDateInput(tomorrow)) return "Tomorrow";
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// Suggest the next free slot when adding to the queue: the day after the last
// scheduled post, at the same time of day, so building a 30-post run is a
// matter of accepting the default 30 times rather than picking 30 dates.
export function suggestNextSlot(queue, now = new Date()) {
  if (queue.length === 0) {
    // Tomorrow at 9am — far enough out that the first post isn't a surprise.
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const last = new Date(queue[queue.length - 1].scheduledAt);
  const next = new Date(last);
  next.setDate(next.getDate() + 1);
  return next;
}
