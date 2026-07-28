"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import YouTubeComments from "./YouTubeComments";
import {
  FiRefreshCw,
  FiEye,
  FiThumbsUp,
  FiMessageCircle,
  FiArrowUpRight,
} from "react-icons/fi";
import { getYouTubeToken } from "../lib/socialTokens";

export default function YouTubePage() {
  const [ytToken, setYtToken] = useState(null);

  const [channel, setChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const connected = Boolean(ytToken);

  // Fetch a fresh YouTube access token from the DB (server-side auto-refresh)
  // instead of reading a possibly-expired token from localStorage.
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
    <div className="rise-in mx-auto max-w-5xl px-6 py-10">
      <div>
        <div className="mb-8">
          <h1 className="balance text-4xl font-bold text-white">
            <span className="bg-gradient-to-r from-rose-400 to-red-500 bg-clip-text text-transparent">
              YouTube
            </span>{" "}
            Videos
          </h1>
          <p className="pretty mt-3 max-w-xl text-slate-400">
            Your recent uploads with stats — expand any video to read and reply
            to comments.
          </p>
        </div>

        {!connected && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">
            <p className="text-sm">No YouTube channel connected yet.</p>
            <Link href="/connect" className="btn btn-primary">
              Go to Connect
            </Link>
          </div>
        )}

        {connected && channel && (
          <div className="glass relative mb-6 flex items-center justify-between overflow-hidden rounded-2xl p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rose-500/20 blur-3xl"
            />
            <div className="relative flex items-center gap-4">
              {channel.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={channel.thumbnail}
                  alt={channel.title}
                  className="app-img h-14 w-14 rounded-full object-cover ring-2 ring-rose-400/40"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 text-lg font-semibold text-rose-200 ring-2 ring-rose-400/40">
                  {channel.title?.[0] ?? "?"}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-white">
                  {channel.title}
                </p>
                <p className="truncate text-sm text-slate-400">
                  <span className="tabular text-slate-300">
                    {fmtNum(channel.subscribers)}
                  </span>{" "}
                  subscribers ·{" "}
                  <span className="tabular text-slate-300">
                    {fmtNum(channel.videoCount)}
                  </span>{" "}
                  videos
                </p>
              </div>
            </div>
            <button
              onClick={() => loadChannel(ytToken)}
              className="btn btn-ghost relative"
            >
              <FiRefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 break-all rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
            {error} — try reconnecting on the{" "}
            <Link href="/connect" className="font-medium underline">
              Connect
            </Link>{" "}
            page (Google tokens expire after about an hour).
          </div>
        )}

        {loading && (
          <p className="text-sm text-slate-500">Loading videos…</p>
        )}

        {!loading && connected && !error && (
          <div className="stagger space-y-4">
            {videos.length === 0 ? (
              <p className="text-sm text-slate-500">No videos found.</p>
            ) : (
              videos.map((video) => (
                <div key={video.id} className="glass glass-hover rounded-2xl p-5">
                  <div className="flex gap-4">
                    {video.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.thumbnail}
                        alt=""
                        className="app-img aspect-video h-auto w-40 flex-shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="balance break-words text-base font-semibold text-white">
                        {video.title || (
                          <span className="italic text-slate-500">
                            (untitled)
                          </span>
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-400 ring-1 ring-white/10">
                          {fmtDate(video.publishedAt)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-slate-400 ring-1 ring-white/10">
                          <FiEye className="h-3.5 w-3.5" /> <span className="tabular">{fmtNum(video.views)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-slate-400 ring-1 ring-white/10">
                          <FiThumbsUp className="h-3.5 w-3.5" /> <span className="tabular">{fmtNum(video.likes)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-slate-400 ring-1 ring-white/10">
                          <FiMessageCircle className="h-3.5 w-3.5" />{" "}
                          <span className="tabular">{fmtNum(video.comments)}</span>
                        </span>
                        <a
                          href={`https://www.youtube.com/watch?v=${video.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-rose-400 hover:text-rose-300"
                        >
                          Watch on YouTube <FiArrowUpRight className="h-3.5 w-3.5" />
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
            className="font-medium text-rose-400 hover:text-rose-300"
          >
            YouTube Analytics
          </Link>{" "}
          or go back to{" "}
          <Link
            href="/connect"
            className="font-medium text-rose-400 hover:text-rose-300"
          >
            Connect
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
