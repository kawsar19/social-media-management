"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { THEME_COOKIE, normalizeTheme } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

// Read the persisted theme from the request cookie. Returns "dark" | "light".
export async function getThemeCookie() {
  const store = await cookies();
  return normalizeTheme(store.get(THEME_COOKIE)?.value);
}

// Persist an explicit theme choice to the cookie and re-render the shell so the
// server-rendered <html data-theme> reflects it immediately.
export async function setTheme(theme) {
  const next = normalizeTheme(theme);
  const store = await cookies();
  store.set(THEME_COOKIE, next, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
  // Revalidate the root layout so <html data-theme> is re-rendered with the new value.
  revalidatePath("/", "layout");
  return next;
}

// Flip the current theme. Reads the existing cookie, writes the opposite.
export async function toggleTheme() {
  const current = await getThemeCookie();
  return setTheme(current === "dark" ? "light" : "dark");
}
