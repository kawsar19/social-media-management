import Link from "next/link";
import { BUSINESS } from "../lib/business";

// Footer for the public pages. Beyond looking finished, this is where the
// legal links live — platform reviewers (Meta especially) look for a reachable
// privacy policy and data-deletion route from the site's own pages, not just as
// URLs pasted into a form.
export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black/20">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <p className="text-sm font-semibold text-white">
              {BUSINESS.product}
            </p>
            <p className="pretty mt-2 text-sm text-slate-400">
              Publish, moderate, and measure across every connected social
              account from one place.
            </p>
          </div>

          <div className="flex gap-12">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Product
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/login" className="text-slate-400 hover:text-white">
                    Log in
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="text-slate-400 hover:text-white">
                    Sign up
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Legal
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="text-slate-400 hover:text-white">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-slate-400 hover:text-white">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/data-deletion"
                    className="text-slate-400 hover:text-white"
                  >
                    Delete my data
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BUSINESS.name}. All rights reserved.
          </p>
          <p>
            Contact:{" "}
            <a
              href={`mailto:${BUSINESS.email}`}
              className="hover:text-slate-300"
            >
              {BUSINESS.email}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
