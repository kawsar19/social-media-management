"use client";

import { useEffect, useState } from "react";

// Light/dark theme switch. The initial data-theme is set pre-paint by the
// inline script in the root layout; this component just reflects and toggles it,
// persisting the choice to localStorage under "theme".
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore write failures (private mode, etc.)
    }
    setTheme(next);
  }

  // Avoid a mismatched icon flash before we've read the current theme.
  const isDark = theme !== "light";

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="btn btn-ghost h-9 w-9 flex-shrink-0 rounded-lg p-0 text-base"
    >
      <span
        aria-hidden
        className="transition-transform duration-200"
        style={{ transform: theme ? "rotate(0deg)" : "rotate(-90deg)" }}
      >
        {isDark ? "☀️" : "🌙"}
      </span>
    </button>
  );
}
