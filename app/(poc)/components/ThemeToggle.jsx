"use client";

import { useEffect, useState, useTransition } from "react";
import { FiSun, FiMoon } from "react-icons/fi";
import { toggleTheme } from "../lib/theme-actions";

// Light/dark theme switch. The theme is persisted server-side in a cookie and
// rendered onto <html data-theme> by the root layout. This button reflects the
// current attribute and calls the `toggleTheme` server action to flip it,
// optimistically updating the DOM for instant feedback.
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    // Optimistic update so the UI responds immediately; the server action
    // persists the cookie and revalidates the layout to match.
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    startTransition(async () => {
      await toggleTheme();
    });
  }

  // Avoid a mismatched icon flash before we've read the current theme.
  const isDark = theme !== "light";

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="btn btn-ghost h-9 w-9 flex-shrink-0 rounded-lg p-0 text-base"
    >
      <span
        aria-hidden
        className="flex transition-transform duration-200"
        style={{ transform: theme ? "rotate(0deg)" : "rotate(-90deg)" }}
      >
        {isDark ? (
          <FiSun className="h-4 w-4" />
        ) : (
          <FiMoon className="h-4 w-4" />
        )}
      </span>
    </button>
  );
}
