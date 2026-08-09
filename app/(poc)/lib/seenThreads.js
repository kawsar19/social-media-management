const SEEN_THREADS_KEY = "facebook_seen_threads";

// Threads opened in this browser. Facebook's own unread_count is the source of
// truth, but it lags a mark_seen call by a few seconds — long enough that
// navigating back to the list would still show the blue dot on a thread just
// read. This records the local intent so the list can clear it immediately.
export function getSeenThreadIds() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEEN_THREADS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function markThreadSeen(threadId) {
  if (typeof window === "undefined" || !threadId) return;
  const seen = getSeenThreadIds();
  if (seen.includes(threadId)) return;
  // Bounded so the key can't grow without limit; the newest entries are the
  // only ones that matter, since older threads have long since synced.
  const next = [threadId, ...seen].slice(0, 200);
  try {
    localStorage.setItem(SEEN_THREADS_KEY, JSON.stringify(next));
  } catch {
    // Quota or private-mode failure — the dot just clears on the next sync.
  }
}

// A thread counts as unread only if Facebook says so AND we haven't just
// opened it locally.
export function applySeenState(threads) {
  const seen = new Set(getSeenThreadIds());
  return threads.map((t) => (t.unread && seen.has(t.id) ? { ...t, unread: false } : t));
}
