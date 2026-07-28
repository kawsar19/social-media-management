"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiBarChart2 } from "react-icons/fi";
import { filterEnabledPages } from "../lib/enabledPages";
import { getPlatformToken } from "../lib/socialTokens";

function StatCard({ label, value }) {
  return (
    <div className="glass glass-hover rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <span className="h-2 w-2 rounded-full bg-indigo-400/70 shadow-[0_0_12px] shadow-indigo-400/50" />
      </div>
      <p className="tabular mt-3 text-3xl font-bold text-white">
        {value ?? "—"}
      </p>
    </div>
  );
}

export default function InsightsPage() {
  const [fbToken, setFbToken] = useState(null);
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");

  const [pageStats, setPageStats] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const connected = Boolean(fbToken);

  // Facebook token from the DB instead of localStorage.
  useEffect(() => {
    let cancelled = false;
    getPlatformToken("facebook").then((t) => {
      if (!cancelled) setFbToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!fbToken) return;
    let cancelled = false;
    fetch("/api/auth/facebook/pages", {
      headers: { Authorization: `Bearer ${fbToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setPages(filterEnabledPages(data.pages || []));
        else setError(data.error || "Failed to load Pages");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load Pages");
      });
    return () => {
      cancelled = true;
    };
  }, [fbToken]);

  function loadInsights(pageId) {
    if (!pageId) return;
    setLoading(true);
    setError(null);
    setPageStats(null);
    setPosts([]);
    fetch(`/api/auth/facebook/insights?pageId=${encodeURIComponent(pageId)}`, {
      headers: { Authorization: `Bearer ${fbToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load insights");
        } else {
          setPageStats(data.page || null);
          setPosts(data.posts || []);
        }
      })
      .catch(() => setError("Failed to load insights"))
      .finally(() => setLoading(false));
  }

  function onSelectPage(e) {
    const id = e.target.value;
    setSelectedPageId(id);
    loadInsights(id);
  }

  const totals = posts.reduce(
    (acc, p) => ({
      likes: acc.likes + (p.likes || 0),
      comments: acc.comments + (p.comments || 0),
      shares: acc.shares + (p.shares || 0),
    }),
    { likes: 0, comments: 0, shares: 0 }
  );

  function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString();
  }

  return (
    <div className="rise-in mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-300">
          <FiBarChart2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="balance text-3xl font-bold text-white">
            Page Insights
          </h1>
          <p className="pretty mt-2 text-slate-400">
            Engagement stats for your Facebook Pages and their recent posts.
          </p>
        </div>
      </div>

      {!connected && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">
          <p className="pretty text-sm">No Facebook account connected yet.</p>
          <Link href="/connect" className="btn shrink-0">
            Go to Connect
          </Link>
        </div>
      )}

      {connected && (
        <div className="glass mb-6 rounded-2xl p-6">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">
            Choose a Page
          </label>
          <select value={selectedPageId} onChange={onSelectPage} className="field w-full">
            <option value="">— Select a Page —</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="mb-6 break-all rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
          Loading insights…
        </div>
      )}

      {!loading && pageStats && (
        <>
          {/* Page-level + aggregate stat cards */}
          <div className="stagger mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Followers" value={pageStats.followers} />
            <StatCard label="Total Likes (recent)" value={totals.likes} />
            <StatCard label="Total Comments (recent)" value={totals.comments} />
            <StatCard label="Total Shares (recent)" value={totals.shares} />
          </div>

          {/* Per-post table */}
          {posts.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-sm text-slate-500">
              No posts to analyze.
            </div>
          ) : (
            <div className="glass overflow-x-auto rounded-2xl">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Post</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 text-right font-medium">Reach</th>
                    <th className="px-4 py-3 text-right font-medium">Likes</th>
                    <th className="px-4 py-3 text-right font-medium">Comments</th>
                    <th className="px-4 py-3 text-right font-medium">Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-white/10 transition-colors hover:bg-white/5"
                    >
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate text-slate-200">
                          {p.message || (
                            <span className="italic text-slate-500">
                              (no text)
                            </span>
                          )}
                        </p>
                        {p.permalink && (
                          <a
                            href={p.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-slate-400 underline hover:text-white"
                          >
                            View
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {fmtDate(p.createdTime)}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-slate-200">
                        {p.reach ?? "—"}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-slate-200">
                        {p.likes}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-slate-200">
                        {p.comments}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-slate-200">
                        {p.shares}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="pretty mt-8 text-sm text-slate-400">
        Go to{" "}
        <Link href="/manage" className="font-medium text-slate-200 underline hover:text-white">
          Manage Posts
        </Link>{" "}
        or{" "}
        <Link href="/connect" className="font-medium text-slate-200 underline hover:text-white">
          Connect
        </Link>
        .
      </p>
    </div>
  );
}
