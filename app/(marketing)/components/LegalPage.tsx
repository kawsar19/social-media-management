import { FiAlertTriangle } from "react-icons/fi";
import { BUSINESS, HAS_PLACEHOLDERS } from "../lib/business";

// Shared shell for the legal documents, so the three pages can't drift apart in
// wording, spacing, or "last updated" handling.
export default function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rise-in mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      <p className="pretty mt-3 text-slate-400">{intro}</p>
      <p className="mt-2 text-sm text-slate-500">
        Last updated: {BUSINESS.lastUpdated}
      </p>

      {/* Shown until the placeholders in lib/business.ts are replaced. A policy
          still saying "[Your Company Name]" fails platform review, and that is
          far easier to miss than it looks — so it's called out on the page
          itself rather than left as a comment in the source. */}
      {HAS_PLACEHOLDERS && (
        <div className="pc-note pc-note-warn mt-6">
          <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Not ready to publish.</strong> This document still contains
            placeholder details. Fill in{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 text-xs">
              app/(marketing)/lib/business.ts
            </code>{" "}
            with your real company name, contact email, and address before
            submitting the app for review. This notice disappears once they are
            set.
          </span>
        </div>
      )}

      <div className="legal-body mt-10">{children}</div>
    </div>
  );
}
