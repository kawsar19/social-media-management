// Shared helper for the "which Facebook Pages should the app show" preference.
// The user picks Pages on /connect; the choice is a JSON array of Page ids in
// localStorage. All Page-listing screens filter through here.
//
// Semantics: an EMPTY / missing list means "no restriction — show all Pages".
// Once the user enables at least one Page, only those Pages are shown.

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

// Filter a list of page objects ({ id, ... }) by the saved preference.
// If nothing is enabled yet, return the list unchanged (show all).
export function filterEnabledPages(pages) {
  const enabled = getEnabledPageIds();
  if (enabled.length === 0) return pages;
  return pages.filter((p) => enabled.includes(p.id));
}
