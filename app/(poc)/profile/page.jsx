"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiUser, FiLink, FiEdit3, FiClock, FiCheckCircle, FiAlertTriangle } from "react-icons/fi";
import { useAuth } from "../components/AuthProvider";
import { listPosts } from "../lib/posts";
import { fetchAccounts } from "../lib/socialTokens";

// Profile dashboard: who you are, how many accounts you've connected, and a
// snapshot of your saved posts by status, with quick links into the rest of the
// posting workflow.
export default function ProfilePage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPosts(), fetchAccounts()]).then(([p, a]) => {
      if (cancelled) return;
      setPosts(p);
      setAccounts(a);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = posts.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const stats = [
    { label: "Drafts", value: counts.draft || 0, Icon: FiEdit3, accent: "text-slate-300" },
    { label: "Scheduled", value: counts.scheduled || 0, Icon: FiClock, accent: "text-amber-300" },
    {
      label: "Published",
      value: (counts.published || 0) + (counts.partial || 0),
      Icon: FiCheckCircle,
      accent: "text-emerald-300",
    },
    { label: "Failed", value: counts.failed || 0, Icon: FiAlertTriangle, accent: "text-rose-300" },
  ];

  return (
    <div className="rise-in mx-auto max-w-4xl px-6 py-10">
      <header className="glass mb-8 flex items-center gap-5 rounded-2xl p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-2xl font-bold text-white">
          {user?.name?.[0]?.toUpperCase() ?? <FiUser />}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-white">
            {user?.name || "Your Profile"}
          </h1>
          {user?.email && (
            <p className="truncate text-sm text-slate-400">{user.email}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {accounts.length} connected account{accounts.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {/* Post stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ label, value, Icon, accent }) => (
          <div key={label} className="glass rounded-2xl p-5">
            <Icon className={"h-5 w-5 " + accent} />
            <p className="tabular mt-3 text-3xl font-bold text-white">
              {loading ? "—" : value}
            </p>
            <p className="text-sm text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions. The Saved Posts and Publish cards are omitted while
          those routes are hidden from the nav (see `disabled` in
          lib/navigation) — leaving them here would be a second way in to
          pages we've deliberately taken down. Restore them alongside the
          nav entries. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/connect" className="glass glass-hover rounded-2xl p-6">
          <FiLink className="h-6 w-6 text-emerald-400" />
          <h2 className="mt-3 font-semibold text-white">Connect</h2>
          <p className="mt-1 text-sm text-slate-400">
            Manage which social accounts you can publish to.
          </p>
        </Link>
      </div>
    </div>
  );
}
