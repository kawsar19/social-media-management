"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FiEdit3, FiSend, FiFolder, FiBarChart2, FiTrendingUp, FiLink, FiZap, FiMenu, FiX, FiLogOut, FiUser } from "react-icons/fi";
import { FaYoutube } from "react-icons/fa6";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "./AuthProvider";

const links = [
  { href: "/post", label: "Post", Icon: FiEdit3 },
  { href: "/publish", label: "Publish All", Icon: FiSend },
  { href: "/manage", label: "Manage", Icon: FiFolder },
  { href: "/insights", label: "Insights", Icon: FiBarChart2 },
  { href: "/youtube", label: "YouTube", Icon: FaYoutube },
  { href: "/youtube-insights", label: "YT Analytics", Icon: FiTrendingUp },
  { href: "/connect", label: "Connect", Icon: FiLink },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    router.push("/login");
  }

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
          {user ? (
            <div className="flex items-center gap-2 pl-2">
              <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300">
                <FiUser className="h-3.5 w-3.5" />
                <span className="max-w-[120px] truncate">{user.name}</span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <FiLogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2">
              <Link
                href="/login"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-rose-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:brightness-110 active:scale-95"
              >
                Sign up
              </Link>
            </div>
          )}
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
          <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
            <ThemeToggle />
            {user ? (
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-slate-300">
                  <FiUser className="h-4 w-4" />
                  {user.name}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <FiLogOut className="h-3.5 w-3.5" />
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-rose-500 px-3 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-violet-500/25"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
