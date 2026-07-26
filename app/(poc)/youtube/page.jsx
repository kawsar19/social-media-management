"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import YouTubeComments from "./YouTubeComments";

const YT_KEY = "youtube_access_token";

export default function YouTubePage() {
  const [ytToken, setYtToken] = useState(null);

  const [channel, setChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const connected = Boolean(ytToken);

  useEffect(() => {
    setYtToken(localStorage.getItem(YT_KEY));
  }, []);

  function loadChannel(token) {
    if (!token) return;
    setLoading(true);
    setError(null);
    setChannel(null);
    setVideos([]);
    fetch("/api/auth/youtube/channel", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          // Most likely an expired token (Google tokens last ~1 hour).
          setError(data.error || "Failed to load channel");
        } else {
          setChannel(data.channel || null);
          setVideos(data.videos || []);
        }
      })
      .catch(() => setError("Failed to load channel"))
      .finally(() => setLoading(false));
  }

  // Load the channel + recent videos once we have a token.
  useEffect(() => {
    if (ytToken) loadChannel(ytToken);
  }, [ytToken]);

  function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString();
  }

  function fmtNum(n) {
    return n != null ? Number(n).toLocaleString() : "—";
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">YouTube Videos</h1>
        <p className="mt-2 text-slate-500">
          Your recent uploads with stats — expand any video to read and reply to
          comments.
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

      {connected && channel && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            {channel.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={channel.thumbnail}
                alt={channel.title}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
                {channel.title?.[0] ?? "?"}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">
                {channel.title}
              </p>
              <p className="truncate text-sm text-slate-500">
                {fmtNum(channel.subscribers)} subscribers ·{" "}
                {fmtNum(channel.videoCount)} videos
              </p>
            </div>
          </div>
          <button
            onClick={() => loadChannel(ytToken)}
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

      {loading && <p className="text-sm text-slate-400">Loading videos…</p>}

      {!loading && connected && !error && (
        <div className="space-y-4">
          {videos.length === 0 ? (
            <p className="text-sm text-slate-400">No videos found.</p>
          ) : (
            videos.map((video) => (
              <div
                key={video.id}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="flex gap-4">
                  {video.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnail}
                      alt=""
                      className="h-20 w-32 flex-shrink-0 rounded-lg border object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-slate-900">
                      {video.title || (
                        <span className="italic text-slate-400">(untitled)</span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>{fmtDate(video.publishedAt)}</span>
                      <span>👁 {fmtNum(video.views)}</span>
                      <span>👍 {fmtNum(video.likes)}</span>
                      <span>💬 {fmtNum(video.comments)}</span>
                      <a
                        href={`https://www.youtube.com/watch?v=${video.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-slate-600"
                      >
                        Watch on YouTube
                      </a>
                    </div>
                  </div>
                </div>

                <YouTubeComments ytToken={ytToken} videoId={video.id} />
              </div>
            ))
          )}
        </div>
      )}

      <p className="mt-8 text-sm text-slate-500">
        See your{" "}
        <Link
          href="/youtube-insights"
          className="font-medium text-slate-900 underline"
        >
          YouTube Analytics
        </Link>{" "}
        or go back to{" "}
        <Link href="/connect" className="font-medium text-slate-900 underline">
          Connect
        </Link>
        .
      </p>
    </div>
  );
}
