"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/post", label: "Post" },
  { href: "/connect", label: "Connect" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/post" className="text-lg font-bold text-slate-900">
          Social Manager
        </Link>

        <div className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                    : "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
