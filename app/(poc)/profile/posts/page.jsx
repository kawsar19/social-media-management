"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaLinkedin,
  FaFacebook,
  FaYoutube,
  FaInstagram,
  FaThreads,
} from "react-icons/fa6";
import {
  FiSend,
  FiTrash2,
  FiExternalLink,
  FiClock,
  FiCheck,
  FiX,
  FiLoader,
  FiEdit3,
} from "react-icons/fi";
import { listPosts, deletePost, publishPost } from "../../lib/posts";

const PLATFORM_META = {
  linkedin: { Icon: FaLinkedin, label: "LinkedIn", accent: "text-sky-400" },
  facebook: { Icon: FaFacebook, label: "Facebook", accent: "text-indigo-400" },
  instagram: { Icon: FaInstagram, label: "Instagram", accent: "text-pink-400" },
  threads: { Icon: FaThreads, label: "Threads", accent: "text-slate-100" },
  youtube: { Icon: FaYoutube, label: "YouTube", accent: "text-rose-400" },
};

const STATUS_STYLE = {
  draft: "border-white/15 bg-white/10 text-slate-300",
  scheduled: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  publishing: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  published: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  partial: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  failed: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
];

export default function SavedPostsPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState(null); // id being published/deleted
  const [error, setError] = useState("");

  async function load(status) {
    setLoading(true);
    const p = await listPosts(status || undefined);
    setPosts(p);
    setLoading(false);
  }

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function onPublish(id) {
    setBusyId(id);
    setError("");
    try {
      const updated = await publishPost(id);
      setPosts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
    } catch (e) {
      setError(e?.message || "Failed to publish");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id) {
    if (!confirm("Delete this post? This can't be undone.")) return;
    setBusyId(id);
    setError("");
    try {
      await deletePost(id);
      setPosts((prev) => prev.filter((p) => p._id !== id));
    } catch (e) {
      setError(e?.message || "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rise-in mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Saved Posts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your drafts and published posts — see where each one went.
          </p>
        </div>
        <Link href="/publish" className="btn btn-primary">
          <FiEdit3 className="h-4 w-4" /> New post
        </Link>
      </div>

      {/* Status filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            onClick={() => setFilter(f.key)}
            className={
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
              (filter === f.key
                ? "border-white/25 bg-white/10 text-white"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading posts…</p>
      ) : posts.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-slate-400">No posts yet.</p>
          <Link href="/publish" className="btn btn-primary mt-4 inline-flex">
            Compose your first post
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              busy={busyId === post._id}
              onPublish={() => onPublish(post._id)}
              onDelete={() => onDelete(post._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, busy, onPublish, onDelete }) {
  const canPublish =
    post.status === "draft" ||
    post.status === "scheduled" ||
    post.status === "failed" ||
    post.status === "partial";

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span
            className={
              "inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize " +
              (STATUS_STYLE[post.status] || STATUS_STYLE.draft)
            }
          >
            {post.status}
          </span>
          {post.scheduledAt && post.status === "scheduled" && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-300">
              <FiClock className="h-3 w-3" />
              {new Date(post.scheduledAt).toLocaleString()}
            </span>
          )}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">
            {post.content || <span className="text-slate-500">(no text)</span>}
          </p>
        </div>
        {post.mediaUrl &&
          (post.mediaType === "video" ? (
            <video
              src={post.mediaUrl}
              className="h-20 w-20 shrink-0 rounded-lg border border-white/10 object-cover"
              muted
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.mediaUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-lg border border-white/10 object-cover"
            />
          ))}
      </div>

      {/* Targets — where this post went + per-destination result */}
      {post.targets?.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-white/10 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Destinations
          </p>
          {post.targets.map((t, i) => {
            const meta = PLATFORM_META[t.platform] || {};
            const { Icon } = meta;
            const name = t.destinationName || t.accountName || meta.label;
            return (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                {Icon && <Icon className={"h-4 w-4 shrink-0 " + meta.accent} />}
                <span className="min-w-0 flex-1 truncate text-slate-300">
                  {name}
                  {t.error && (
                    <span className="ml-1 text-rose-300">— {t.error}</span>
                  )}
                </span>
                <TargetBadge status={t.status} />
                {t.permalink && t.status === "success" && (
                  <a
                    href={t.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-slate-400 hover:text-white"
                    title="View post"
                  >
                    <FiExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
        {canPublish && (
          <button
            onClick={onPublish}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? (
              <>
                <FiLoader className="h-4 w-4 animate-spin" /> Publishing…
              </>
            ) : (
              <>
                <FiSend className="h-4 w-4" />{" "}
                {post.status === "draft" || post.status === "scheduled"
                  ? "Publish now"
                  : "Retry"}
              </>
            )}
          </button>
        )}
        <button onClick={onDelete} disabled={busy} className="btn btn-danger">
          <FiTrash2 className="h-4 w-4" /> Delete
        </button>
      </div>
    </div>
  );
}

function TargetBadge({ status }) {
  const map = {
    success: { Icon: FiCheck, cls: "text-emerald-300", label: "Sent" },
    failed: { Icon: FiX, cls: "text-rose-300", label: "Failed" },
    pending: { Icon: FiClock, cls: "text-slate-400", label: "Pending" },
    skipped: { Icon: FiX, cls: "text-slate-500", label: "Skipped" },
  };
  const s = map[status] || map.pending;
  const { Icon } = s;
  return (
    <span className={"inline-flex shrink-0 items-center gap-1 text-xs " + s.cls}>
      <Icon className="h-3.5 w-3.5" /> {s.label}
    </span>
  );
}
