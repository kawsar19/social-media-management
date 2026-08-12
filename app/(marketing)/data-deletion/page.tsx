import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "../components/LegalPage";
import { BUSINESS } from "../lib/business";

export const metadata: Metadata = {
  title: "Data Deletion — Social Manager",
  description:
    "How to delete your Social Manager account and all data associated with your connected social accounts.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion"
      intro="How to remove your data from Social Manager, in whole or in part."
    >
      <p>
        You can delete your data at any time. Choose whichever of the following
        matches what you want removed.
      </p>

      <h2>Option 1 — Disconnect a single social account</h2>
      <p>
        This removes our stored access token for that account. We stop being able
        to read from or publish to it immediately.
      </p>
      <ul>
        <li>
          Sign in and open the <Link href="/connect">Connect</Link> page.
        </li>
        <li>Find the account you want to remove.</li>
        <li>Choose <strong>Disconnect</strong>.</li>
      </ul>
      <p>
        Posts you already published stay on that platform — they belong to your
        social account, not to us. Remove them on the platform itself if you want
        them gone.
      </p>

      <h2>Option 2 — Delete your entire account</h2>
      <p>
        This permanently removes your {BUSINESS.product} account and everything
        we hold for it: your email and password hash, every stored access token,
        your drafts, scheduled posts, publishing history, and any media still in
        our storage.
      </p>
      <ul>
        <li>
          Email <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> from the
          address registered to your account, with the subject{" "}
          <strong>&ldquo;Delete my account&rdquo;</strong>.
        </li>
        <li>
          We verify the request comes from the account holder, then delete the
          data within <strong>30 days</strong> and confirm by email.
        </li>
      </ul>

      <h2>Removing the app from Facebook or Instagram</h2>
      <p>
        You can also revoke our access from Meta&rsquo;s own settings, which stops
        the connection from their side:
      </p>
      <ul>
        <li>
          Facebook: <strong>Settings &amp; Privacy → Settings → Apps and
          Websites</strong>, then remove {BUSINESS.product}.
        </li>
        <li>
          Instagram: <strong>Settings → Website Permissions → Apps and
          Websites</strong>, then remove {BUSINESS.product}.
        </li>
      </ul>
      <p>
        Revoking access there invalidates our token immediately. To also erase the
        data we already stored, use Option 1 or Option 2 above.
      </p>

      <h2>What we cannot delete</h2>
      <p>
        Content already published to a social platform lives on that platform and
        must be deleted there. We may also retain limited records where the law
        requires it — for example fraud-prevention or accounting records — and
        those are kept only as long as required.
      </p>

      <h2>Questions</h2>
      <p>
        Contact <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> and we
        will help. See our <Link href="/privacy">Privacy Policy</Link> for what we
        collect and why.
      </p>
    </LegalPage>
  );
}
