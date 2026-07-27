"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaLinkedin, FaFacebook, FaYoutube } from "react-icons/fa6";
import { FiImage, FiVideo, FiCheck, FiX, FiLoader, FiClock } from "react-icons/fi";
import { filterEnabledPages } from "../lib/enabledPages";

const LINKEDIN_KEY = "linkedin_access_token";
const FB_KEY = "facebook_user_access_token";
const YT_KEY = "youtube_access_token";

// The three target platforms, in the order they publish (sequential).
const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn", Icon: FaLinkedin, accent: "text-sky-400" },
  { id: "facebook", label: "Facebook", Icon: FaFacebook, accent: "text-indigo-400" },
  { id: "youtube", label: "YouTube", Icon: FaYoutube, accent: "text-rose-400" },
];

// Per-target run states, used to drive the live progress UI.
const STATUS = {
  idle: "idle",
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

export default function PublishPage() {
  // Connection tokens (read from localStorage, same keys as the Post page).
  const [tokens, setTokens] = useState({ linkedin: null, facebook: null, youtube: null });

  // Which platforms the user wants to publish to.
  const [selected, setSelected] = useState({ linkedin: true, facebook: true, youtube: true });

  // Shared post content.
  const [text, setText] = useState("");
  const [image, setImage] = useState(null); // File
  const [preview, setPreview] = useState(null); // object URL
  const [video, setVideo] = useState(null); // File

  // Facebook Pages to post to.
  const [fbPages, setFbPages] = useState([]);
  const [fbPagesLoading, setFbPagesLoading] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState([]);

  // YouTube-specific fields (only used when a video is attached).
  const [ytTitle, setYtTitle] = useState("");
  const [ytPrivacy, setYtPrivacy] = useState("private");

  // Live run state: per-platform { status, message } while publishing.
  const [runs, setRuns] = useState(null); // null = not started; else { [id]: {status, message} }
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setTokens({
      linkedin: localStorage.getItem(LINKEDIN_KEY),
      facebook: localStorage.getItem(FB_KEY),
      youtube: localStorage.getItem(YT_KEY),
    });
  }, []);

  // Load Facebook Pages when connected + selected.
  useEffect(() => {
    if (!selected.facebook || !tokens.facebook) return;
    let cancelled = false;
    setFbPagesLoading(true);
    fetch("/api/auth/facebook/pages", {
      headers: { Authorization: `Bearer ${tokens.facebook}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setFbPages(filterEnabledPages(data.pages || []));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFbPagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected.facebook, tokens.facebook]);

  function onPickImage(e) {
    const file = e.target.files?.[0] ?? null;
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
    if (file) clearVideo();
  }

  function clearImage() {
    setImage(null);
    setPreview(null);
  }

  function onPickVideo(e) {
    const file = e.target.files?.[0] ?? null;
    setVideo(file);
    if (file) {
      clearImage();
      if (!ytTitle.trim()) setYtTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  }

  function clearVideo() {
    setVideo(null);
  }

  function togglePlatform(id) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function togglePage(id) {
    setSelectedPageIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  const connected = {
    linkedin: Boolean(tokens.linkedin),
    facebook: Boolean(tokens.facebook),
    youtube: Boolean(tokens.youtube),
  };

  const hasVideo = Boolean(video);

  // Which targets will actually run: selected + connected. YouTube only runs
  // when a video is present (it has no text-only mode) — otherwise it's skipped.
  function plannedStatus(id) {
    if (!selected[id] || !connected[id]) return null; // not in the run at all
    if (id === "youtube" && !hasVideo) return STATUS.skipped;
    return STATUS.pending;
  }

  const activeTargets = PLATFORMS.filter((p) => plannedStatus(p.id) === STATUS.pending);

  // Can we publish? At least one active target, some content, and (for FB) a Page.
  const hasContent = text.trim().length > 0 || hasVideo || Boolean(image);
  const fbNeedsPage =
    selected.facebook && connected.facebook && selectedPageIds.length === 0;
  const ytNeedsTitle =
    selected.youtube && connected.youtube && hasVideo && !ytTitle.trim();
  const canPublish =
    !publishing &&
    activeTargets.length > 0 &&
    hasContent &&
    !fbNeedsPage &&
    !ytNeedsTitle;

  // --- Individual publishers. Each returns { ok, message }. ---

  async function runLinkedIn() {
    const fd = new FormData();
    fd.append("text", text);
    if (video) fd.append("video", video);
    else if (image) fd.append("image", image);
    const res = await fetch("/api/auth/linkedin/share", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.linkedin}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.error || "Failed to publish" };
    return { ok: true, message: data.id ? `Published (${data.id})` : "Published" };
  }

  async function runFacebook() {
    const fd = new FormData();
    fd.append("text", text);
    if (video) fd.append("video", video);
    else if (image) fd.append("image", image);
    fd.append("pageIds", JSON.stringify(selectedPageIds));
    const res = await fetch("/api/auth/facebook/share", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.facebook}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.error || "Failed to publish" };
    const results = data.results || [];
    const okCount = results.filter((r) => r.ok).length;
    if (okCount === results.length) {
      return { ok: true, message: `Published to ${okCount} Page${okCount > 1 ? "s" : ""}` };
    }
    const firstErr = results.find((r) => !r.ok)?.error || "Some Pages failed";
    return {
      ok: false,
      message: `${okCount}/${results.length} Pages OK — ${firstErr}`,
    };
  }

  async function runYouTube() {
    const fd = new FormData();
    fd.append("video", video);
    fd.append("title", ytTitle);
    fd.append("description", text);
    fd.append("privacy", ytPrivacy);
    const res = await fetch("/api/auth/youtube/share", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.youtube}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.error || "Failed to upload" };
    return { ok: true, message: `Uploaded (${data.id}) — ${data.privacyStatus}` };
  }

  const RUNNERS = { linkedin: runLinkedIn, facebook: runFacebook, youtube: runYouTube };

  async function publishAll() {
    setPublishing(true);

    // Seed the run state: active targets pending, unmet ones skipped.
    const initial = {};
    for (const p of PLATFORMS) {
      const st = plannedStatus(p.id);
      if (st) initial[p.id] = { status: st, message: st === STATUS.skipped ? "No video — skipped" : "Waiting…" };
    }
    setRuns(initial);

    // Publish one platform at a time, updating status live as each finishes.
    for (const p of activeTargets) {
      setRuns((prev) => ({ ...prev, [p.id]: { status: STATUS.running, message: "Publishing…" } }));
      try {
        const out = await RUNNERS[p.id]();
        setRuns((prev) => ({
          ...prev,
          [p.id]: { status: out.ok ? STATUS.done : STATUS.failed, message: out.message },
        }));
      } catch {
        setRuns((prev) => ({
          ...prev,
          [p.id]: { status: STATUS.failed, message: "Network error" },
        }));
      }
    }

    setPublishing(false);
  }

  function reset() {
    setRuns(null);
    setText("");
    clearImage();
    clearVideo();
    setYtTitle("");
  }

  const anyConnected = connected.linkedin || connected.facebook || connected.youtube;
  const allDone =
    runs && Object.values(runs).every((r) => r.status !== STATUS.running && r.status !== STATUS.pending);

  return (
    <div className="rise-in mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="balance text-4xl font-bold tracking-tight text-white">
          Publish Everywhere
        </h1>
        <p className="pretty mt-3 text-slate-400">
          Write once, publish to all your connected accounts — one after another,
          with live progress.
        </p>
      </div>

      {!anyConnected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">
          <p className="pretty text-sm">No accounts connected yet.</p>
          <Link href="/connect" className="btn btn-primary">
            Go to Connect
          </Link>
        </div>
      )}

      <div className="glass rounded-2xl p-6">
        {/* Platform picker */}
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Publish to
        </p>
        <div className="mb-6 grid gap-2 sm:grid-cols-3">
          {PLATFORMS.map(({ id, label, Icon, accent }) => {
            const isConnected = connected[id];
            const isOn = selected[id] && isConnected;
            return (
              <button
                key={id}
                type="button"
                disabled={!isConnected || publishing}
                onClick={() => togglePlatform(id)}
                className={
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors " +
                  (isOn
                    ? "border-white/25 bg-white/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/5") +
                  (!isConnected ? " cursor-not-allowed opacity-40" : "")
                }
              >
                <Icon className={"h-5 w-5 " + accent} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-xs text-slate-500">
                    {isConnected ? (isOn ? "Selected" : "Off") : "Not connected"}
                  </p>
                </div>
                <span
                  className={
                    "flex h-5 w-5 items-center justify-center rounded-md border " +
                    (isOn ? "border-white/30 bg-white/20 text-white" : "border-white/15 text-transparent")
                  }
                >
                  <FiCheck className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>

        {/* Facebook Page picker */}
        {selected.facebook && connected.facebook && (
          <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Facebook — which Pages?
            </p>
            {fbPagesLoading && fbPages.length === 0 ? (
              <p className="text-sm text-slate-500">Loading Pages…</p>
            ) : fbPages.length === 0 ? (
              <p className="text-sm text-slate-500">No Pages found.</p>
            ) : (
              <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
                {fbPages.map((page) => (
                  <label
                    key={page.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2.5 transition-colors hover:border-indigo-400/40 hover:bg-indigo-400/10"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPageIds.includes(page.id)}
                      onChange={() => togglePage(page.id)}
                      className="h-4 w-4 accent-indigo-400"
                    />
                    <span className="truncate text-sm text-slate-300">{page.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Shared content */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="What do you want to share everywhere?"
          className="field w-full resize-none"
        />

        <div className="mt-4 flex flex-wrap items-start gap-3">
          {/* Image (hidden when a video is chosen) */}
          {!video &&
            (preview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Selected"
                  className="app-img max-h-48 rounded-xl border border-white/10 object-cover"
                />
                <button
                  onClick={clearImage}
                  className="absolute right-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10">
                <FiImage className="h-4 w-4" /> Add image
                <input type="file" accept="image/*" onChange={onPickImage} className="hidden" />
              </label>
            ))}

          {/* Video (hidden when an image is chosen) */}
          {!image &&
            (video ? (
              <div className="flex items-center gap-3 rounded-xl border border-violet-400/30 bg-violet-400/10 p-3">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 truncate text-sm font-medium text-white">
                    <FiVideo className="h-4 w-4" /> {video.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    <span className="tabular">{(video.size / (1024 * 1024)).toFixed(1)}</span> MB
                  </p>
                </div>
                <button onClick={clearVideo} className="btn btn-danger">
                  Remove
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-violet-400/40 hover:bg-violet-400/10">
                <FiVideo className="h-4 w-4" /> Add video
                <input type="file" accept="video/*" onChange={onPickVideo} className="hidden" />
              </label>
            ))}
        </div>

        {/* YouTube extras — only relevant with a video */}
        {selected.youtube && connected.youtube && hasVideo && (
          <div className="mt-4 grid gap-3 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={ytTitle}
              onChange={(e) => setYtTitle(e.target.value)}
              placeholder="YouTube title"
              maxLength={100}
              className="field w-full"
            />
            <select
              value={ytPrivacy}
              onChange={(e) => setYtPrivacy(e.target.value)}
              className="field text-sm"
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </div>
        )}

        {/* Notes */}
        {hasVideo ? null : selected.youtube && connected.youtube ? (
          <p className="mt-3 text-xs text-slate-500">
            YouTube needs a video — it will be skipped for this text/image post.
          </p>
        ) : null}

        {/* Action row */}
        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-5">
          <span className="text-sm text-slate-500">
            {activeTargets.length > 0 ? (
              <>
                Will publish to{" "}
                <span className="font-medium text-slate-300">
                  {activeTargets.map((t) => t.label).join(", ")}
                </span>
              </>
            ) : (
              "Select a connected platform"
            )}
          </span>
          {allDone ? (
            <button onClick={reset} className="btn btn-primary">
              New post
            </button>
          ) : (
            <button onClick={publishAll} disabled={!canPublish} className="btn btn-primary">
              {publishing ? "Publishing…" : "Publish to all"}
            </button>
          )}
        </div>

        {fbNeedsPage && (
          <p className="mt-3 text-sm text-amber-300">Select at least one Facebook Page.</p>
        )}
        {ytNeedsTitle && (
          <p className="mt-3 text-sm text-amber-300">Add a YouTube title for the video.</p>
        )}

        {/* Live progress */}
        {runs && (
          <div className="mt-6 space-y-2.5">
            {PLATFORMS.filter((p) => runs[p.id]).map((p) => {
              const r = runs[p.id];
              const { Icon } = p;
              return (
                <div
                  key={p.id}
                  className={
                    "flex items-center gap-3 rounded-xl border p-3.5 transition-all duration-300 " +
                    (r.status === STATUS.done
                      ? "border-emerald-400/30 bg-emerald-400/10"
                      : r.status === STATUS.failed
                      ? "border-rose-400/30 bg-rose-400/10"
                      : r.status === STATUS.running
                      ? "border-violet-400/40 bg-violet-400/10"
                      : "border-white/10 bg-white/[0.03]")
                  }
                >
                  <Icon className={"h-5 w-5 shrink-0 " + p.accent} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{p.label}</p>
                    <p className="truncate text-xs text-slate-400">{r.message}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="pretty mt-6 text-sm text-slate-500">
        Manage connections on the{" "}
        <Link href="/connect" className="font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white">
          Connect
        </Link>{" "}
        page.
      </p>
    </div>
  );
}

// Small status pill that mirrors a target's run state.
function StatusBadge({ status }) {
  if (status === STATUS.done) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-1 text-xs font-medium text-emerald-300">
        <FiCheck className="h-3.5 w-3.5" /> Done
      </span>
    );
  }
  if (status === STATUS.failed) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-rose-400/20 px-2.5 py-1 text-xs font-medium text-rose-200">
        <FiX className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }
  if (status === STATUS.running) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-violet-400/20 px-2.5 py-1 text-xs font-medium text-violet-200">
        <FiLoader className="h-3.5 w-3.5 animate-spin" /> Publishing
      </span>
    );
  }
  if (status === STATUS.skipped) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-400">
        Skipped
      </span>
    );
  }
  // pending
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-400">
      <FiClock className="h-3.5 w-3.5" /> Waiting
    </span>
  );
}
