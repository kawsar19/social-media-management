"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiZap, FiArrowRight } from "react-icons/fi";

// Header for the public pages. Separate from the app's Navbar: that one reads
// auth state and links into the dashboard, while this one's job is to get a
// visitor into /signup.
//
// The bar starts transparent so the hero's spotlight runs edge to edge, and
// only takes on its glass background once the page scrolls — a permanent solid
// bar cuts a hard line across the top of the hero.
export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll(); // a reload partway down the page starts scrolled
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={
        "sticky top-0 z-50 transition-all duration-300 " +
        (scrolled ? "glass-bar border-b border-white/10" : "border-b border-transparent")
      }
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-white shadow-lg shadow-indigo-500/25 transition-transform duration-300 group-hover:scale-105">
            <FiZap className="h-4 w-4" />
          </span>
          <span className="text-[0.95rem] font-semibold tracking-tight text-[var(--text-strong)]">
            Social Manager
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Hidden on the narrowest screens: with three controls the bar wraps
              on a small phone, and "Log in" is the one a new visitor needs
              least — signup is the primary path. */}
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-body)] transition-colors hover:text-[var(--text-strong)] sm:inline-flex"
          >
            Log in
          </Link>
          <Link href="/signup" className="btn btn-primary group">
            Get started
            <FiArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
