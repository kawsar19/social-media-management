"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiRefreshCw, FiArrowRight } from "react-icons/fi";
import { FaYoutube } from "react-icons/fa6";
import { getYouTubeToken } from "../lib/socialTokens";

const DAYS = 28;

function StatCard({ label, value }) {
  return (
    <div className="glass glass-hover rounded-2xl p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="tabular mt-2 text-3xl font-bold text-white">{value ?? "—"}</p>
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

  // Fresh YouTube token from the DB (server-side auto-refresh).
  useEffect(() => {
    let cancelled = false;
    getYouTubeToken()
      .then((t) => {
        if (!cancelled) setYtToken(t);
      })
      .catch(() => {
        if (!cancelled) setYtToken(null);
      });
    return () => {
      cancelled = true;
    };
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
    <div className="rise-in mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 text-white shadow-lg shadow-rose-500/20">
            <FaYoutube className="h-6 w-6" />
          </span>
          <div>
            <h1 className="balance text-3xl font-bold text-white">
              YouTube Analytics
            </h1>
            <p className="pretty mt-2 text-slate-400">
              Channel performance over the last {DAYS} days
              {range ? (
                <>
                  {" "}
                  ({range.startDate}{" "}
                  <FiArrowRight className="inline h-3.5 w-3.5" /> {range.endDate})
                </>
              ) : (
                ""
              )}
              .
            </p>
          </div>
        </div>

        {connected && (
          <button
            onClick={() => loadAnalytics(ytToken)}
            className="btn btn-ghost flex-shrink-0"
          >
            <FiRefreshCw className="h-4 w-4" /> Refresh
          </button>
        )}
      </header>

      {!connected && (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200 sm:flex-row sm:items-center">
          <p className="text-sm">No YouTube channel connected yet.</p>
          <Link href="/connect" className="btn flex-shrink-0">
            Go to Connect
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-6 break-all rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error} — try reconnecting on the{" "}
          <Link href="/connect" className="font-medium underline hover:text-white">
            Connect
          </Link>{" "}
          page (Google tokens expire after about an hour).
        </div>
      )}

      {loading && (
        <p className="text-sm text-slate-500">Loading analytics…</p>
      )}

      {!loading && totals && (
        <>
          <div className="stagger mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

          <div className="glass rounded-2xl p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Daily breakdown
              </h2>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <span className="h-2 w-6 rounded-full bg-gradient-to-r from-rose-500 to-orange-400" />
                Views
              </span>
            </div>
            {daily.length === 0 ? (
              <p className="text-sm text-slate-500">
                No daily data available for this range.
              </p>
            ) : (
              <div className="space-y-2.5">
                {daily.map((d) => (
                  <div
                    key={d.date}
                    className="flex items-center gap-2 text-xs sm:gap-3"
                  >
                    <span className="tabular w-16 flex-shrink-0 text-slate-500 sm:w-24">
                      {d.date}
                    </span>
                    <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400"
                        style={{
                          width: `${
                            maxViews > 0 ? ((d.views || 0) / maxViews) * 100 : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="tabular w-16 flex-shrink-0 text-right font-medium text-white">
                      {fmtNum(d.views)}
                    </span>
                    <span className="tabular hidden w-24 flex-shrink-0 text-right text-slate-500 sm:block">
                      {fmtNum(d.estimatedMinutesWatched)} min
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <p className="pretty mt-8 text-sm text-slate-400">
        Go to{" "}
        <Link
          href="/youtube"
          className="font-medium text-slate-200 underline hover:text-white"
        >
          YouTube Videos
        </Link>{" "}
        or{" "}
        <Link
          href="/connect"
          className="font-medium text-slate-200 underline hover:text-white"
        >
          Connect
        </Link>
        .
      </p>
    </div>
  );
}
