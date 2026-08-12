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
  { Icon: FaThreads, label: "Threads", accent: "text-slate-200" },
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
      {/* Hero */}
      <section className="rise-in mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-300">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-white">
            <FiZap className="h-3 w-3" />
          </span>
          One dashboard for every channel
        </span>

        <h1 className="balance mx-auto max-w-3xl bg-gradient-to-b from-white to-slate-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl">
          Your social presence, unified.
        </h1>
        <p className="pretty mx-auto mt-5 max-w-xl text-lg text-slate-400">
          Publish to LinkedIn, Facebook, Instagram, Threads, and YouTube at once
          — then manage every comment and message from one place.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="btn btn-primary px-6 py-3">
            Get started free <FiArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="btn btn-ghost px-6 py-3">
            Log in
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          No credit card required. Disconnect any account at any time.
        </p>

        {/* Supported platforms, stated plainly — the first thing a visitor
            checks is whether their channels are covered. */}
        <div className="mt-14">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Works with
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {platforms.map(({ Icon, label, accent }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-400"
              >
                <Icon className={`h-5 w-5 ${accent}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="balance text-3xl font-bold tracking-tight text-white">
            Everything in one workflow
          </h2>
          <p className="pretty mt-3 text-slate-400">
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
                className="glass rounded-2xl p-6 text-left"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-slate-200">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="balance font-semibold text-white">{f.title}</h3>
                <p className="pretty mt-1.5 text-sm text-slate-400">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="balance text-3xl font-bold tracking-tight text-white">
            Up and running in minutes
          </h2>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="balance mt-4 font-semibold text-white">
                {s.title}
              </h3>
              <p className="pretty mt-1.5 text-sm text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust. Connecting social accounts is the step visitors hesitate on, so
          the security position is stated on the page rather than buried in the
          privacy policy. */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="glass rounded-2xl p-8 sm:p-10">
          <h2 className="balance text-2xl font-bold tracking-tight text-white">
            Your accounts stay yours
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              "We never see your social platform passwords — you authorise on their site.",
              "Access tokens are stored server-side and never exposed to your browser.",
              "Disconnect any account instantly from the Connect page.",
              "Delete your account and all its data whenever you want.",
            ].map((point) => (
              <li key={point} className="flex gap-2.5 text-sm text-slate-300">
                <FiCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="pretty">{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-400">
            Read our <Link href="/privacy" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">Privacy Policy</Link>{" "}
            or{" "}
            <Link href="/data-deletion" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
              delete your data
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="mx-auto max-w-6xl px-4 pb-24 pt-8 text-center sm:px-6">
        <h2 className="balance text-3xl font-bold tracking-tight text-white">
          Ready to post everywhere at once?
        </h2>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="btn btn-primary px-6 py-3">
            Create your account <FiArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
