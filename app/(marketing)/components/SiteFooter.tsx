import Link from "next/link";
import { FiZap } from "react-icons/fi";
import {
  FaLinkedin,
  FaFacebook,
  FaYoutube,
  FaThreads,
  FaInstagram,
} from "react-icons/fa6";
import { BUSINESS } from "../lib/business";

const platforms = [
  { Icon: FaLinkedin, label: "LinkedIn" },
  { Icon: FaFacebook, label: "Facebook" },
  { Icon: FaInstagram, label: "Instagram" },
  { Icon: FaThreads, label: "Threads" },
  { Icon: FaYoutube, label: "YouTube" },
];

// Footer for the public pages. Beyond finishing the page, this is where the
// legal links live — platform reviewers (Meta especially) look for a reachable
// privacy policy and data-deletion route from the site's own pages, not just as
// URLs pasted into their form.
export default function SiteFooter() {
  return (
    <footer className="relative mt-8 border-t border-[var(--glass-border)]">
      {/* A faint wash so the footer reads as part of the page rather than a
          slab bolted onto the bottom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.03] to-transparent"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="group inline-flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-white shadow-lg shadow-indigo-500/25">
                <FiZap className="h-4 w-4" />
              </span>
              <span className="font-semibold tracking-tight text-[var(--text-strong)]">
                {BUSINESS.product}
              </span>
            </Link>
            <p className="pretty mt-4 max-w-xs text-sm text-[var(--text-muted)]">
              Publish, moderate, and measure across every connected social
              account from one place.
            </p>

            <div className="mt-5 flex items-center gap-3 text-[var(--text-muted)]">
              {platforms.map(({ Icon, label }) => (
                <span key={label} title={label}>
                  <Icon className="h-4 w-4 transition-colors hover:text-[var(--text-strong)]" />
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="mk-eyebrow">Product</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/signup" className="mk-flink">
                  Create account
                </Link>
              </li>
              <li>
                <Link href="/login" className="mk-flink">
                  Log in
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mk-eyebrow">Legal</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/privacy" className="mk-flink">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="mk-flink">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/data-deletion" className="mk-flink">
                  Delete my data
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-[var(--glass-border)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BUSINESS.name}. All rights reserved.
          </p>
          <p>
            <a
              href={`mailto:${BUSINESS.email}`}
              className="transition-colors hover:text-[var(--text-strong)]"
            >
              {BUSINESS.email}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
