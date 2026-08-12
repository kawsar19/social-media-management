import Link from "next/link";
import type { IconType } from "react-icons";
import {
  FiEdit3,
  FiFolder,
  FiBarChart2,
  FiZap,
  FiArrowRight,
  FiCalendar,
  FiMessageSquare,
  FiImage,
  FiCheck,
  FiShield,
} from "react-icons/fi";
import {
  FaLinkedin,
  FaFacebook,
  FaYoutube,
  FaThreads,
  FaInstagram,
} from "react-icons/fa6";

const features: { Icon: IconType; title: string; body: string }[] = [
  {
    Icon: FiEdit3,
    title: "Compose once, publish everywhere",
    body: "Write a post or upload a video and send it to every connected account in one run, with live per-platform progress.",
  },
  {
    Icon: FiCalendar,
    title: "Schedule ahead",
    body: "Queue posts for later and let them go out on time, without keeping the tab open.",
  },
  {
    Icon: FiMessageSquare,
    title: "One inbox",
    body: "Read and reply to comments and direct messages from every channel without switching apps.",
  },
  {
    Icon: FiBarChart2,
    title: "Analytics side by side",
    body: "Reach, engagement, and channel growth for all your accounts on a single screen.",
  },
  {
    Icon: FiImage,
    title: "AI drafting",
    body: "Draft posts in English, Bangla, or Banglish, and generate images from a description.",
  },
  {
    Icon: FiFolder,
    title: "Post history",
    body: "Every published post with its result and a direct link, kept in one searchable place.",
  },
];

const platforms = [
  { Icon: FaLinkedin, label: "LinkedIn", accent: "text-sky-400" },
  { Icon: FaFacebook, label: "Facebook", accent: "text-indigo-400" },
  { Icon: FaInstagram, label: "Instagram", accent: "text-pink-400" },
  { Icon: FaThreads, label: "Threads", accent: "text-slate-400" },
  { Icon: FaYoutube, label: "YouTube", accent: "text-rose-400" },
];

const steps = [
  {
    title: "Connect your accounts",
    body: "Sign in with each platform. We never see your platform passwords — authorisation happens on their site.",
  },
  {
    title: "Write your post",
    body: "Compose it yourself or let AI draft it, then attach an image or video.",
  },
  {
    title: "Publish or schedule",
    body: "Send it out now and watch each destination report back, or queue it for later.",
  },
];

export default function Home() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pb-14 pt-20 sm:px-6 sm:pt-28">
        <div className="mk-spotlight" aria-hidden />

        <div className="rise-in relative mx-auto max-w-6xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-1.5 text-xs font-medium text-[var(--text-body)] backdrop-blur">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-white">
              <FiZap className="h-3 w-3" />
            </span>
            One dashboard for every channel
          </span>

          <h1 className="balance mx-auto mt-7 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight text-[var(--text-strong)] sm:text-7xl">
            Post everywhere.
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-rose-400 bg-clip-text text-transparent">
              Manage in one place.
            </span>
          </h1>

          <p className="pretty mx-auto mt-6 max-w-xl text-lg text-[var(--text-muted)]">
            Publish to LinkedIn, Facebook, Instagram, Threads, and YouTube at
            once — then handle every comment and message from a single inbox.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="btn btn-primary group px-6 py-3 text-base">
              Get started free
              <FiArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
            <Link href="/login" className="btn btn-ghost px-6 py-3 text-base">
              Log in
            </Link>
          </div>

          <p className="mt-4 text-xs text-[var(--text-muted)]">
            No credit card required · Disconnect any account at any time
          </p>

          {/* A glimpse of the actual product. Abstract enough to stay honest —
              it shows the publish flow's shape, not invented metrics. */}
          <div className="relative mx-auto mt-16 max-w-3xl">
            <div className="glass rounded-2xl p-5 text-left shadow-2xl">
              <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  Publish Everywhere
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3.5">
                <p className="text-sm text-[var(--text-body)]">
                  Our new website is live — three months of work from the whole
                  team. 🎉
                </p>
              </div>

              <div className="mt-3 space-y-2">
                {platforms.map(({ Icon, label, accent }, i) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
                    <span className="flex-1 text-xs font-medium text-[var(--text-body)]">
                      {label}
                    </span>
                    {/* The last row stays "publishing" so the mock reads as a
                        run in progress rather than a finished screenshot. */}
                    {i < platforms.length - 1 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                        <FiCheck className="h-3 w-3" /> Published
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        Publishing…
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Supported platforms. Sits close under the hero mock: the two
             belong together, and a wide gap here left the page looking
             like it had stopped. ───────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-14 text-center sm:px-6">
        <p className="mk-eyebrow justify-center">Works with</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {platforms.map(({ Icon, label, accent }) => (
            <span key={label} className="mk-pill">
              <Icon className={`h-4 w-4 ${accent}`} />
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mk-eyebrow justify-center">Features</p>
          <h2 className="balance mt-3 text-3xl font-bold tracking-tight text-[var(--text-strong)] sm:text-4xl">
            Everything in one workflow
          </h2>
          <p className="pretty mt-3 text-[var(--text-muted)]">
            Stop switching tabs to keep five accounts alive.
          </p>
        </div>

        <div className="stagger mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const { Icon } = f;
            return (
              <div
                key={f.title}
                style={{ "--i": i } as React.CSSProperties}
                className="mk-card"
              >
                <div className="mk-icon">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="balance mt-4 font-semibold text-[var(--text-strong)]">
                  {f.title}
                </h3>
                <p className="pretty mt-2 text-sm text-[var(--text-muted)]">
                  {f.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mk-eyebrow justify-center">How it works</p>
          <h2 className="balance mt-3 text-3xl font-bold tracking-tight text-[var(--text-strong)] sm:text-4xl">
            Up and running in minutes
          </h2>
        </div>

        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="relative">
              <span className="mk-step-num">{i + 1}</span>
              <h3 className="balance mt-5 font-semibold text-[var(--text-strong)]">
                {s.title}
              </h3>
              <p className="pretty mt-2 text-sm text-[var(--text-muted)]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust. Connecting social accounts is the step visitors hesitate
             on, so the security position is stated here rather than buried
             in the privacy policy. ──────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="glass rounded-2xl p-8 sm:p-10">
          <div className="mk-icon">
            <FiShield className="h-5 w-5" />
          </div>
          <h2 className="balance mt-5 text-2xl font-bold tracking-tight text-[var(--text-strong)] sm:text-3xl">
            Your accounts stay yours
          </h2>
          <ul className="mt-7 grid gap-3.5 sm:grid-cols-2">
            {[
              "We never see your social platform passwords — you authorise on their site.",
              "Access tokens are stored server-side and never exposed to your browser.",
              "Disconnect any account instantly from the Connect page.",
              "Delete your account and all its data whenever you want.",
            ].map((point) => (
              <li
                key={point}
                className="flex gap-2.5 text-sm text-[var(--text-body)]"
              >
                <FiCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="pretty">{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-7 text-sm text-[var(--text-muted)]">
            Read our{" "}
            <Link
              href="/privacy"
              className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
            >
              Privacy Policy
            </Link>{" "}
            or{" "}
            <Link
              href="/data-deletion"
              className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
            >
              delete your data
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ── Closing call to action ───────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6">
        <div className="mk-cta">
          <h2 className="balance text-3xl font-bold tracking-tight text-[var(--text-strong)] sm:text-4xl">
            Ready to post everywhere at once?
          </h2>
          <p className="pretty mx-auto mt-3 max-w-md text-[var(--text-muted)]">
            Connect your first account in under a minute.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="btn btn-primary group px-6 py-3 text-base">
              Create your account
              <FiArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
