import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "../components/LegalPage";
import { BUSINESS } from "../lib/business";

export const metadata: Metadata = {
  title: "Terms of Service — Social Manager",
  description:
    "The terms governing your use of Social Manager, including acceptable use, third-party platforms, and liability.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`The agreement between you and ${BUSINESS.name} for use of ${BUSINESS.product}.`}
    >
      <h2>1. Agreement</h2>
      <p>
        By creating an account or using {BUSINESS.product} (&ldquo;the
        Service&rdquo;), you agree to these terms. If you are using the Service
        for an organisation, you confirm you are authorised to accept these terms
        on its behalf. If you do not agree, do not use the Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        The Service lets you connect social media accounts you control and then
        publish content, manage comments and messages, and view analytics for
        those accounts from one place.
      </p>

      <h2>3. Your account</h2>
      <ul>
        <li>You must provide accurate registration details.</li>
        <li>
          You are responsible for keeping your credentials secure and for all
          activity under your account.
        </li>
        <li>
          You must be old enough to form a binding contract where you live, and at
          least 13.
        </li>
        <li>Tell us promptly if you suspect unauthorised access.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You keep all rights to the content you publish through the Service. You
        grant us only the limited permission needed to store, process, and
        transmit it in order to provide the Service — for example uploading a
        video to a platform on your instruction.
      </p>
      <p>
        You are responsible for your content, including that you hold the
        necessary rights to it and that publishing it is lawful.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Break any law or infringe anyone&rsquo;s rights.</li>
        <li>
          Post spam, malware, or deceptive content, or run automated bulk
          messaging.
        </li>
        <li>
          Publish harassing, hateful, or unlawful material, or anything violating
          a connected platform&rsquo;s own rules.
        </li>
        <li>
          Access accounts you do not own or control, or attempt to breach the
          Service&rsquo;s security.
        </li>
        <li>Resell or redistribute the Service without our written permission.</li>
      </ul>
      <p>
        We may suspend or terminate accounts that breach this section, without
        notice where the breach is serious.
      </p>

      <h2>6. Third-party platforms</h2>
      <p>
        The Service works with platforms we do not control, including Meta
        (Facebook, Instagram, Threads), Google (YouTube), and LinkedIn. Your use
        of each remains subject to that platform&rsquo;s own terms and policies.
      </p>
      <p>
        Those platforms can change or withdraw their APIs, rate-limit requests, or
        reject content at any time. Features may therefore stop working or behave
        differently through no fault of ours, and{" "}
        <strong>we do not guarantee that any given post will publish
        successfully</strong>.
      </p>

      <h2>7. AI features</h2>
      <p>
        The Service offers optional AI assistance for drafting text and generating
        images. AI output can be inaccurate, biased, or unsuitable.{" "}
        <strong>Review anything the AI produces before publishing it</strong> —
        you remain responsible for everything posted from your account. You are
        also responsible for ensuring AI-generated content does not infringe third
        party rights.
      </p>

      <h2>8. Availability</h2>
      <p>
        The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; basis. We do not promise uninterrupted or error-free
        operation, and we may modify or discontinue features. We are not a backup
        service: keep your own copies of anything important.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {BUSINESS.name} is not liable for
        indirect, incidental, special, or consequential damages, nor for lost
        profits, lost data, or lost business opportunities, arising from your use
        of the Service. Nothing here excludes liability that cannot lawfully be
        excluded.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time — see{" "}
        <Link href="/data-deletion">Data Deletion</Link>. We may suspend or
        terminate your access if you breach these terms or if we discontinue the
        Service.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these terms as the Service develops. We will revise the
        &ldquo;last updated&rdquo; date above and, for material changes, give
        notice in the app or by email. Continuing to use the Service after changes
        take effect means you accept them.
      </p>

      <h2>12. Contact</h2>
      <p>
        <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
        <br />
        {BUSINESS.name}, {BUSINESS.address}
      </p>
      <p>
        See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
