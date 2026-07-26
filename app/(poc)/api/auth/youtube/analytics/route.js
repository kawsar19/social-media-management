import { NextResponse } from "next/server";

// YouTube Analytics API (separate from the Data API). Reports views, watch
// time, etc. Requires the yt-analytics.readonly scope.
const YTA = "https://youtubeanalytics.googleapis.com/v2/reports";

async function fetchWithRetry(input, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(15000) });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Format a Date as YYYY-MM-DD (the format the Analytics API requires).
function ymd(date) {
  return date.toISOString().slice(0, 10);
}

// GET /api/auth/youtube/analytics?days=28
// Returns channel analytics for the last N days (default 28):
// { range: { startDate, endDate },
//   totals: { views, estimatedMinutesWatched, likes, subscribersGained },
//   daily: [{ date, views, estimatedMinutesWatched }] }
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 28, 1), 365);

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const startDate = ymd(start);
  const endDate = ymd(end);

  // ids=channel==MINE reports on the signed-in user's own channel.
  const base = {
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,likes,subscribersGained",
  };

  // 1. Totals across the whole range (no dimension).
  const totalsUrl = new URL(YTA);
  for (const [k, v] of Object.entries(base)) totalsUrl.searchParams.set(k, v);

  // 2. Daily breakdown (dimension=day) for a simple time series.
  const dailyUrl = new URL(YTA);
  for (const [k, v] of Object.entries({
    ...base,
    metrics: "views,estimatedMinutesWatched",
    dimensions: "day",
    sort: "day",
  })) {
    dailyUrl.searchParams.set(k, v);
  }

  const headers = { Authorization: `Bearer ${token}` };
  const [totalsRes, dailyRes] = await Promise.all([
    fetchWithRetry(totalsUrl, { cache: "no-store", headers }),
    fetchWithRetry(dailyUrl, { cache: "no-store", headers }),
  ]);
  const [totalsData, dailyData] = await Promise.all([
    totalsRes.json(),
    dailyRes.json(),
  ]);

  if (!totalsRes.ok || totalsData.error) {
    return NextResponse.json(
      { error: totalsData.error?.message || "analytics_fetch_failed" },
      { status: totalsRes.status === 200 ? 400 : totalsRes.status }
    );
  }

  // Analytics responses are column-oriented: rows[] of values matching the
  // columnHeaders order. For totals there's a single row.
  const totalsRow = (totalsData.rows || [])[0] || [];
  const totals = {
    views: totalsRow[0] ?? 0,
    estimatedMinutesWatched: totalsRow[1] ?? 0,
    likes: totalsRow[2] ?? 0,
    subscribersGained: totalsRow[3] ?? 0,
  };

  // Daily rows are [day, views, estimatedMinutesWatched]. Tolerate a failed
  // daily call by returning an empty series rather than erroring the whole call.
  const daily =
    dailyRes.ok && !dailyData.error
      ? (dailyData.rows || []).map((row) => ({
          date: row[0],
          views: row[1] ?? 0,
          estimatedMinutesWatched: row[2] ?? 0,
        }))
      : [];

  return NextResponse.json({
    range: { startDate, endDate },
    totals,
    daily,
  });
}
