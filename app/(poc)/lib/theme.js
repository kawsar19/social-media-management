// Shared theme constants. Kept in a plain module (not "use server") so both the
// root layout and the theme server actions can import them.

export const THEME_COOKIE = "theme";

// "dark" is the app's default theme when no cookie is present.
export const DEFAULT_THEME = "dark";

// Normalize an arbitrary value to a valid theme, falling back to the default.
export function normalizeTheme(value) {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}
