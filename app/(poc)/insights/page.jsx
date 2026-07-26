"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { filterEnabledPages } from "../lib/enabledPages";

const FB_KEY = "facebook_user_access_token";

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value ?? "—"}</p>
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

  useEffect(() => {
    setFbToken(localStorage.getItem(FB_KEY));
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Page Insights</h1>
        <p className="mt-2 text-slate-500">
          Engagement stats for your Facebook Pages and their recent posts.
        </p>
      </div>

      {!connected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No Facebook account connected yet.
          </p>
          <Link
            href="/connect"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Go to Connect
          </Link>
        </div>
      )}

      {connected && (
        <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Choose a Page
          </label>
          <select
            value={selectedPageId}
            onChange={onSelectPage}
            className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 outline-none focus:border-slate-400"
          >
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
        <div className="mb-6 break-all rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading insights…</p>}

      {!loading && pageStats && (
        <>
          {/* Page-level + aggregate stat cards */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Followers" value={pageStats.followers} />
            <StatCard label="Total Likes (recent)" value={totals.likes} />
            <StatCard label="Total Comments (recent)" value={totals.comments} />
            <StatCard label="Total Shares (recent)" value={totals.shares} />
          </div>

          {/* Per-post table */}
          {posts.length === 0 ? (
            <p className="text-sm text-slate-400">No posts to analyze.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Post</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Reach</th>
                    <th className="px-4 py-3 text-right">Likes</th>
                    <th className="px-4 py-3 text-right">Comments</th>
                    <th className="px-4 py-3 text-right">Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate text-slate-900">
                          {p.message || (
                            <span className="italic text-slate-400">
                              (no text)
                            </span>
                          )}
                        </p>
                        {p.permalink && (
                          <a
                            href={p.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-slate-400 underline hover:text-slate-600"
                          >
                            View
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {fmtDate(p.createdTime)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {p.reach ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {p.likes}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {p.comments}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
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

      <p className="mt-8 text-sm text-slate-500">
        Go to{" "}
        <Link href="/manage" className="font-medium text-slate-900 underline">
          Manage Posts
        </Link>{" "}
        or{" "}
        <Link href="/connect" className="font-medium text-slate-900 underline">
          Connect
        </Link>
        .
      </p>
    </div>
  );
}
