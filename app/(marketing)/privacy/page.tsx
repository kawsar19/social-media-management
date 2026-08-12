import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "../components/LegalPage";
import { BUSINESS } from "../lib/business";

export const metadata: Metadata = {
  title: "Privacy Policy — Social Manager",
  description:
    "How Social Manager collects, uses, stores, and deletes your data and your connected social accounts' data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`How ${BUSINESS.name} handles your information when you use ${BUSINESS.product}.`}
    >
      <h2>1. Who we are</h2>
      <p>
        {BUSINESS.product} (&ldquo;the Service&rdquo;) is operated by{" "}
        <strong>{BUSINESS.name}</strong>, {BUSINESS.address}. We are the data
        controller for the information described in this policy. For any privacy
        question or request, contact us at{" "}
        <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
      </p>

      <h2>2. What the Service does</h2>
      <p>
        The Service lets you connect your own social media accounts — such as
        Facebook Pages, Instagram Business accounts, LinkedIn, Threads, and
        YouTube channels — and then publish posts, read and reply to comments and
        messages, and view analytics for those accounts from one dashboard. We
        act on your instructions and only for the accounts you explicitly
        connect.
      </p>

      <h2>3. Information we collect</h2>

      <h3>Account information</h3>
      <p>
        When you register we store your email address and a securely hashed
        password. We never store your password in readable form.
      </p>

      <h3>Social account credentials</h3>
      <p>
        When you connect a social account, that platform gives us an access
        token. We store this token so the Service can act on your behalf. We
        never receive or store your password for any social platform — the login
        happens on that platform&rsquo;s own site.
      </p>

      <h3>Content you create</h3>
      <p>
        Posts you write, images and videos you upload or generate, scheduling
        details, and the publishing results we receive back from each platform.
      </p>

      <h3>Data from connected platforms</h3>
      <p>
        To show your dashboard we read data from the platforms you connect. This
        can include your profile and page details, your published posts, comments
        and direct messages on your accounts, and aggregate engagement metrics.
        This may include information about other people — for example the name
        and message of someone who comments on your page. We process that
        information solely to display it to you and to let you reply.
      </p>

      <h2>4. How we use your information</h2>
      <ul>
        <li>To authenticate you and keep your account secure.</li>
        <li>
          To publish, schedule, and manage content on the accounts you connect,
          at your direction.
        </li>
        <li>To show you comments, messages, and analytics for those accounts.</li>
        <li>To operate, debug, and improve the Service.</li>
      </ul>
      <p>
        <strong>We do not sell your personal information</strong>, and we do not
        use your content or your audience&rsquo;s data for advertising.
      </p>

      <h2>5. AI features</h2>
      <p>
        The Service offers optional AI assistance for drafting post text,
        rewriting replies, and generating images. When you use one of these
        features, the text or prompt you provide is sent to our AI provider
        (Google&rsquo;s Gemini API) to produce the result. Do not enter
        confidential information into these features. AI features are optional
        and are only invoked when you choose to use them.
      </p>

      <h2>6. Media storage</h2>
      <p>
        Images and videos you upload are stored on Cloudflare R2 so the social
        platforms can retrieve them — several platforms fetch media by URL rather
        than accepting a direct upload. While a file is stored there it is
        reachable by anyone holding its URL, so treat uploaded media as public.
        Videos are deleted shortly after publishing completes; images are
        retained so your saved posts keep their previews.
      </p>

      <h2>7. Sharing your information</h2>
      <p>We share information only in these cases:</p>
      <ul>
        <li>
          <strong>With the social platforms you connect</strong> — necessarily,
          to publish and manage content at your request. Their handling is
          governed by their own privacy policies (Meta, Google/YouTube, LinkedIn).
        </li>
        <li>
          <strong>With infrastructure providers</strong> that run the Service on
          our behalf: hosting, database, media storage, and the AI provider named
          above.
        </li>
        <li>
          <strong>Where legally required</strong>, or to protect our rights,
          safety, or users.
        </li>
      </ul>

      <h2>8. Data retention</h2>
      <p>
        We keep your account data while your account is active. Access tokens are
        kept until you disconnect that account or delete your account. Uploaded
        videos are removed shortly after publishing; other content is kept until
        you delete it or close your account.
      </p>

      <h2>9. Your rights</h2>
      <p>
        You can access, correct, export, or delete your personal data. You can
        disconnect any social account at any time from the Connect page, which
        removes our stored access token for it. To delete everything, see our{" "}
        <Link href="/data-deletion">data deletion instructions</Link>. Depending
        on where you live you may also have the right to object to or restrict
        processing, or to complain to your local data protection authority.
      </p>

      <h2>10. Security</h2>
      <p>
        Access tokens and credentials are stored server-side and are never
        exposed to your browser. Passwords are hashed. Traffic is encrypted in
        transit. No system is perfectly secure, but we take reasonable measures
        appropriate to the data we hold.
      </p>

      <h2>11. Children</h2>
      <p>
        The Service is not directed to children under 13 (or the minimum age in
        your jurisdiction), and we do not knowingly collect their data. If you
        believe a child has provided us information, contact us and we will
        delete it.
      </p>

      <h2>12. International transfers</h2>
      <p>
        Our providers may process data in countries other than yours, including
        the United States. Where required, we rely on appropriate safeguards for
        those transfers.
      </p>

      <h2>13. Changes to this policy</h2>
      <p>
        We may update this policy as the Service changes. We will revise the
        &ldquo;last updated&rdquo; date above, and for significant changes we
        will notify you in the app or by email.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
        <br />
        {BUSINESS.name}, {BUSINESS.address}
      </p>
    </LegalPage>
  );
}
