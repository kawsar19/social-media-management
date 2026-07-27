"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiEdit3, FiFolder, FiBarChart2, FiTrendingUp, FiLink, FiZap, FiMenu, FiX } from "react-icons/fi";
import { FaYoutube } from "react-icons/fa6";
import ThemeToggle from "./ThemeToggle";

const links = [
  { href: "/post", label: "Post", Icon: FiEdit3 },
  { href: "/manage", label: "Manage", Icon: FiFolder },
  { href: "/insights", label: "Insights", Icon: FiBarChart2 },
  { href: "/youtube", label: "YouTube", Icon: FaYoutube },
  { href: "/youtube-insights", label: "YT Analytics", Icon: FiTrendingUp },
  { href: "/connect", label: "Connect", Icon: FiLink },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="glass-bar sticky top-0 z-50">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/post" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-white shadow-lg shadow-violet-500/25 transition-transform duration-150 group-active:scale-95">
            <FiZap className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-white">
            Social<span className="text-slate-400">Manager</span>
          </span>
        </Link>

        <div className="hidden sm:flex sm:items-center sm:gap-2">
          <div className="scroll-slim flex items-center gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = pathname === link.href;
              const { Icon } = link;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "relative flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 " +
                    (active
                      ? "text-white"
                      : "text-slate-400 hover:text-white")
                  }
                >
                  {active && (
                    <span className="absolute inset-0 rounded-lg border border-white/15 bg-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset]" />
                  )}
                  <Icon className="relative h-4 w-4" />
                  <span className="relative hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
          </div>
          <ThemeToggle />
        </div>

        <button
          type="button"
          aria-label={open ? "Close navigation menu" : "Toggle navigation menu"}
          aria-expanded={open}
          className="sm:hidden flex items-center justify-center rounded-lg p-2 text-slate-400 hover:text-white transition-colors"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <FiX className="h-6 w-6" />
          ) : (
            <FiMenu className="h-6 w-6" />
          )}
        </button>
      </nav>

      {open && (
        <div className="border-t border-white/10 px-4 pb-4 sm:hidden">
          <div className="flex flex-col gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              const { Icon } = link;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 " +
                    (active
                      ? "text-white"
                      : "text-slate-400 hover:text-white")
                  }
                >
                  {active && (
                    <span className="absolute inset-0 rounded-lg border border-white/15 bg-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset]" />
                  )}
                  <Icon className="relative h-5 w-5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 border-t border-white/10 pt-4">
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
