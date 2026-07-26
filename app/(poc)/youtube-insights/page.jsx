"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const YT_KEY = "youtube_access_token";
const DAYS = 28;

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

export default function YouTubeInsightsPage() {
  const [ytToken, setYtToken] = useState(null);

  const [range, setRange] = useState(null);
  const [totals, setTotals] = useState(null);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const connected = Boolean(ytToken);

  useEffect(() => {
    setYtToken(localStorage.getItem(YT_KEY));
  }, []);

  function loadAnalytics(token) {
    if (!token) return;
    setLoading(true);
    setError(null);
    setRange(null);
    setTotals(null);
    setDaily([]);
    fetch(`/api/auth/youtube/analytics?days=${DAYS}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          // Most likely an expired token (Google tokens last ~1 hour).
          setError(data.error || "Failed to load analytics");
        } else {
          setRange(data.range || null);
          setTotals(data.totals || null);
          setDaily(data.daily || []);
        }
      })
      .catch(() => setError("Failed to load analytics"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ytToken) loadAnalytics(ytToken);
  }, [ytToken]);

  function fmtNum(n) {
    return n != null ? Number(n).toLocaleString() : "—";
  }

  // Largest daily views value, used to scale the simple bar chart.
  const maxViews = daily.reduce((m, d) => Math.max(m, d.views || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">YouTube Analytics</h1>
        <p className="mt-2 text-slate-500">
          Channel performance over the last {DAYS} days
          {range ? ` (${range.startDate} → ${range.endDate})` : ""}.
        </p>
      </div>

      {!connected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No YouTube channel connected yet.
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
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => loadAnalytics(ytToken)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            ↻ Refresh
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 break-all rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error} — try reconnecting on the{" "}
          <Link href="/connect" className="font-medium underline">
            Connect
          </Link>{" "}
          page (Google tokens expire after about an hour).
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading analytics…</p>}

      {!loading && totals && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Views" value={fmtNum(totals.views)} />
            <StatCard
              label="Watch time (min)"
              value={fmtNum(totals.estimatedMinutesWatched)}
            />
            <StatCard label="Likes" value={fmtNum(totals.likes)} />
            <StatCard
              label="Subscribers gained"
              value={fmtNum(totals.subscribersGained)}
            />
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">
              Daily breakdown
            </h2>
            {daily.length === 0 ? (
              <p className="text-sm text-slate-400">
                No daily data available for this range.
              </p>
            ) : (
              <div className="space-y-2">
                {daily.map((d) => (
                  <div key={d.date} className="flex items-center gap-3 text-xs">
                    <span className="w-24 flex-shrink-0 text-slate-500">
                      {d.date}
                    </span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded bg-red-500"
                        style={{
                          width: `${
                            maxViews > 0 ? ((d.views || 0) / maxViews) * 100 : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="w-16 flex-shrink-0 text-right text-slate-900">
                      {fmtNum(d.views)}
                    </span>
                    <span className="w-24 flex-shrink-0 text-right text-slate-400">
                      {fmtNum(d.estimatedMinutesWatched)} min
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-8 text-sm text-slate-500">
        Go to{" "}
        <Link href="/youtube" className="font-medium text-slate-900 underline">
          YouTube Videos
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
