const ENABLED_PAGES_KEY = "facebook_enabled_pages";

export function getEnabledPageIds() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ENABLED_PAGES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function setEnabledPageIds(ids) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ENABLED_PAGES_KEY, JSON.stringify(ids));
}

export function filterEnabledPages(pages) {
  const enabled = getEnabledPageIds();
  if (enabled.length === 0) return pages;
  return pages.filter((p) => enabled.includes(p.id));
}