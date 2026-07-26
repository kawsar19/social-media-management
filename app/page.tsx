import Link from "next/link";

export default function Home() {
  const features = [
    { icon: "✍️", title: "Compose once", body: "Write a post or upload a video and publish across LinkedIn, Facebook, and YouTube.", href: "/post" },
    { icon: "🗂️", title: "Manage & moderate", body: "Browse recent posts, read comments, and reply without leaving the dashboard.", href: "/manage" },
    { icon: "📊", title: "See what works", body: "Engagement and channel analytics for every connected account, side by side.", href: "/insights" },
  ];

  return (
    <div className="app-shell flex flex-1 flex-col items-center justify-center px-6 py-20">
      <div className="rise-in mx-auto w-full max-w-3xl text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-300">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-[10px]">
            ⚡
          </span>
          One dashboard for every channel
        </span>

        <h1 className="balance bg-gradient-to-b from-white to-slate-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl">
          Your social presence, unified.
        </h1>
        <p className="pretty mx-auto mt-5 max-w-xl text-lg text-slate-400">
          Connect LinkedIn, Facebook, and YouTube — then post, manage comments,
          and track analytics from a single, beautiful place.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/connect" className="btn btn-primary px-6 py-3">
            Get started →
          </Link>
          <Link href="/post" className="btn btn-ghost px-6 py-3">
            Create a post
          </Link>
        </div>
      </div>

      <div className="stagger mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {features.map((f, i) => (
          <Link
            key={f.title}
            href={f.href}
            style={{ "--i": i } as React.CSSProperties}
            className="glass glass-hover group rounded-2xl p-6 text-left"
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-xl">
              {f.icon}
            </div>
            <h3 className="balance font-semibold text-white">{f.title}</h3>
            <p className="pretty mt-1.5 text-sm text-slate-400">{f.body}</p>
            <span className="mt-3 inline-block text-sm font-medium text-slate-500 transition-colors group-hover:text-white">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
