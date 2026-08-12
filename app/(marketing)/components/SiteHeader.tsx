import Link from "next/link";
import { FiZap } from "react-icons/fi";

// Header for the public pages (landing + legal). Deliberately separate from the
// app's Navbar: that one reads auth state and links into the dashboard, while
// this one is static and its job is to get a visitor to sign in or sign up.
export default function SiteHeader() {
  return (
    <header className="glass-bar sticky top-0 z-40 border-b border-white/10">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-white">
            <FiZap className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">
            Social Manager
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  );
}
