"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const links = [
  { href: "/post", label: "Post", icon: "✍️" },
  { href: "/manage", label: "Manage", icon: "🗂️" },
  { href: "/insights", label: "Insights", icon: "📊" },
  { href: "/youtube", label: "YouTube", icon: "▶️" },
  { href: "/youtube-insights", label: "YT Analytics", icon: "📈" },
  { href: "/connect", label: "Connect", icon: "🔗" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="glass-bar sticky top-0 z-50">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/post" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-base shadow-lg shadow-violet-500/25 transition-transform duration-150 group-active:scale-95">
            ⚡
          </span>
          <span className="text-[15px] font-bold tracking-tight text-white">
            Social<span className="text-slate-400">Manager</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="scroll-slim flex items-center gap-1 overflow-x-auto">
          {links.map((link) => {
            const active = pathname === link.href;
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
                <span className="relative text-xs">{link.icon}</span>
                <span className="relative hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
          </div>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
