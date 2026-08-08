"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaFacebook,
  FaInstagram,
  FaThreads,
  FaYoutube,
} from "react-icons/fa6";
import {
  FiRefreshCw,
  FiMessageSquare,
  FiMessageCircle,
  FiAtSign,
  FiInbox,
} from "react-icons/fi";
import { filterEnabledPages } from "../lib/enabledPages";
import { getAccountsMap, getYouTubeToken } from "../lib/socialTokens";

// Quick time windows the user asked for.
const WINDOWS = [
  { label: "Last 6h", hours: 6 },
  { label: "Last 12h", hours: 12 },
  { label: "Last 24h", hours: 24 },
];

// Per-platform presentation (icon + accent). Purely visual.
const PLATFORMS = {
  facebook: { name: "Facebook", Icon: FaFacebook, dot: "bg-indigo-400", text: "text-indigo-400", tile: "border-indigo-400/20 bg-indigo-400/10" },
  instagram: { name: "Instagram", Icon: FaInstagram, dot: "bg-pink-400", text: "text-pink-400", tile: "border-pink-400/20 bg-pink-400/10" },
  threads: { name: "Threads", Icon: FaThreads, dot: "bg-slate-200", text: "text-slate-100", tile: "border-white/20 bg-white/10" },
  youtube: { name: "YouTube", Icon: FaYoutube, dot: "bg-rose-400", text: "text-rose-400", tile: "border-rose-400/20 bg-rose-400/10" },
};

const TYPES = {
  comment: { label: "Comments", Icon: FiMessageSquare },
  mention: { label: "Mentions", Icon: FiAtSign },
  message: { label: "Messages", Icon: FiMessageCircle },
};

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function InboxPage() {
  const [fbToken, setFbToken] = useState(null);
  const [ytToken, setYtToken] = useState(null);
  const [thToken, setThToken] = useState(null);

  const [windowHours, setWindowHours] = useState(24);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  // Non-fatal, per-source notes (e.g. "Messages need App Review").
  const [notes, setNotes] = useState([]);
  const [lastLoaded, setLastLoaded] = useState(null);
  // "Now" reference, refreshed on every load. Kept in state (rather than calling
  // Date.now() during render) so time-window filtering stays a pure computation.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Load platform tokens from the DB. YouTube goes through the refresh
  // endpoint so an expired token is renewed server-side.
  useEffect(() => {
    let cancelled = false;
    getAccountsMap().then((map) => {
      if (cancelled) return;
      setFbToken(map.facebook?.accessToken || null);
      setThToken(map.threads?.accessToken || null);
    });
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

  const anyConnected = Boolean(fbToken || ytToken || thToken);

  // Fetch everything, merge, and store. `since` is derived from the widest
  // window (24h) so switching windows re-filters client-side without refetch.
  const load = useCallback(async () => {
    if (!anyConnected) return;
    setLoading(true);
    setNotes([]);
    const collected = [];
    const collectedNotes = [];
    // Fetch a bit wider than the largest quick-window so the toggle is instant.
    const since = Math.floor((Date.now() - 24 * 3600 * 1000) / 1000);

    // Build the list of source fetches based on what's connected.
    const tasks = [];

    if (fbToken) {
      // FB + IG both ride the Facebook token. Resolve pages & IG accounts first.
      tasks.push(
        (async () => {
          // Facebook pages
          const pagesRes = await fetch("/api/auth/facebook/pages", {
            headers: { Authorization: `Bearer ${fbToken}` },
          }).then((r) => r.json()).catch(() => ({}));
          const pages = filterEnabledPages(pagesRes.pages || []);
          await Promise.all(
            pages.map(async (page) => {
              const res = await fetch(
                `/api/auth/facebook/activity?pageId=${encodeURIComponent(page.id)}&since=${since}`,
                { headers: { Authorization: `Bearer ${fbToken}` } }
              ).then((r) => r.json()).catch(() => ({}));
              if (Array.isArray(res.items)) collected.push(...res.items);
              if (res.errors?.messages)
                collectedNotes.push(`Facebook messages (${page.name}): needs the pages_messaging permission (App Review).`);
            })
          );
        })()
      );

      tasks.push(
        (async () => {
          // Instagram accounts (also via the FB token)
          const igRes = await fetch("/api/auth/instagram/accounts", {
            headers: { Authorization: `Bearer ${fbToken}` },
          }).then((r) => r.json()).catch(() => ({}));
          const accounts = igRes.accounts || [];
          await Promise.all(
            accounts.map(async (acct) => {
              const res = await fetch(
                `/api/auth/instagram/activity?igId=${encodeURIComponent(acct.id)}&since=${since}`,
                { headers: { Authorization: `Bearer ${fbToken}` } }
              ).then((r) => r.json()).catch(() => ({}));
              if (Array.isArray(res.items)) collected.push(...res.items);
              if (res.errors?.messages)
                collectedNotes.push(`Instagram DMs (@${acct.username}): needs the instagram_manage_messages permission (App Review).`);
            })
          );
        })()
      );
    }

    if (thToken) {
      tasks.push(
        fetch(`/api/auth/threads/activity?since=${since}`, {
          headers: { Authorization: `Bearer ${thToken}` },
        })
          .then((r) => r.json())
          .then((res) => {
            if (Array.isArray(res.items)) collected.push(...res.items);
          })
          .catch(() => {})
      );
    }

    if (ytToken) {
      tasks.push(
        fetch("/api/auth/youtube/activity", {
          headers: { Authorization: `Bearer ${ytToken}` },
        })
          .then((r) => r.json())
          .then((res) => {
            if (Array.isArray(res.items)) collected.push(...res.items);
          })
          .catch(() => {})
      );
    }

    await Promise.all(tasks);

    // Newest first.
    collected.sort(
      (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    );
    setItems(collected);
    setNotes([...new Set(collectedNotes)]);
    setLastLoaded(new Date());
    setNowMs(Date.now());
    setLoading(false);
  }, [anyConnected, fbToken, thToken, ytToken]);

  // Load once tokens are known.
  useEffect(() => {
    if (anyConnected) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyConnected]);

  // Client-side filtering: time window + platform + type.
  const visible = useMemo(() => {
    const cutoff = nowMs - windowHours * 3600 * 1000;
    return items.filter((it) => {
      const t = it.timestamp ? new Date(it.timestamp).getTime() : 0;
      if (!t || t < cutoff) return false;
      if (platformFilter !== "all" && it.platform !== platformFilter) return false;
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      return true;
    });
  }, [items, nowMs, windowHours, platformFilter, typeFilter]);

  // Counts per platform/type for the current time window (ignoring the active
  // platform/type filter) so the filter chips can show live totals.
  const windowItems = useMemo(() => {
    const cutoff = nowMs - windowHours * 3600 * 1000;
    return items.filter((it) => {
      const t = it.timestamp ? new Date(it.timestamp).getTime() : 0;
      return t && t >= cutoff;
    });
  }, [items, nowMs, windowHours]);

  const countBy = (key, val) =>
    windowItems.filter((it) => it[key] === val).length;

  return (
    <div className="rise-in mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="balance flex items-center gap-3 text-3xl font-bold text-white">
            <FiInbox className="h-7 w-7 text-indigo-400" />
            Unified Inbox
          </h1>
          <p className="pretty mt-2 text-slate-400">
            Latest comments, mentions and messages across all your platforms — in one place.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading || !anyConnected}
          className="btn btn-ghost"
        >
          <FiRefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!anyConnected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">
          <p className="text-sm">No accounts connected yet.</p>
          <Link href="/connect" className="btn btn-primary">
            Go to Connect
          </Link>
        </div>
      )}

      {anyConnected && (
        <>
          {/* Time window toggle */}
          <div className="glass mb-4 rounded-2xl p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Time window
            </p>
            <div className="flex flex-wrap gap-2">
              {WINDOWS.map((w) => {
                const active = windowHours === w.hours;
                return (
                  <button
                    key={w.hours}
                    onClick={() => setWindowHours(w.hours)}
                    style={{
                      background: active ? "var(--fill-track)" : "transparent",
                      borderColor: active ? "var(--glass-border-hover)" : "var(--glass-border)",
                      color: active ? "var(--text-strong)" : "var(--text-muted)",
                    }}
                    className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Platform + type filters */}
          <div className="mb-6 flex flex-wrap gap-2">
            <FilterChip
              active={platformFilter === "all"}
              onClick={() => setPlatformFilter("all")}
              label="All platforms"
              count={windowItems.length}
            />
            {Object.entries(PLATFORMS).map(([key, p]) => {
              const c = countBy("platform", key);
              const { Icon } = p;
              return (
                <FilterChip
                  key={key}
                  active={platformFilter === key}
                  onClick={() => setPlatformFilter(key)}
                  label={p.name}
                  count={c}
                  Icon={Icon}
                  iconClass={p.text}
                />
              );
            })}
            <span className="mx-1 self-center text-slate-600">·</span>
            <FilterChip
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
              label="All types"
            />
            {Object.entries(TYPES).map(([key, t]) => {
              const { Icon } = t;
              return (
                <FilterChip
                  key={key}
                  active={typeFilter === key}
                  onClick={() => setTypeFilter(key)}
                  label={t.label}
                  count={countBy("type", key)}
                  Icon={Icon}
                />
              );
            })}
          </div>

          {/* Non-fatal notes (e.g. messages pending App Review) */}
          {notes.length > 0 && (
            <div className="mb-6 space-y-1 rounded-xl border border-sky-400/25 bg-sky-400/10 p-4 text-sm text-sky-800">
              {notes.map((n, i) => (
                <p key={i}>ℹ️ {n}</p>
              ))}
            </div>
          )}

          {/* Feed */}
          {loading && items.length === 0 ? (
            <p className="text-sm text-slate-500">Loading activity…</p>
          ) : visible.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <FiInbox className="mx-auto mb-3 h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-400">
                No activity in the {WINDOWS.find((w) => w.hours === windowHours)?.label.toLowerCase()}.
              </p>
            </div>
          ) : (
            <div className="stagger space-y-3">
              <p className="text-sm text-slate-400">
                <span className="tabular">{visible.length}</span> item
                {visible.length === 1 ? "" : "s"}
                {lastLoaded && (
                  <span className="text-slate-500">
                    {" "}· updated {relativeTime(lastLoaded.toISOString())}
                  </span>
                )}
              </p>
              {visible.map((it, index) => (
                <ActivityCard
                  key={it.id}
                  item={it}
                  index={index}
                  fbToken={fbToken}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count, Icon, iconClass }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--fill-track)" : "var(--fill-subtle)",
        borderColor: active ? "var(--glass-border-hover)" : "var(--glass-border)",
        color: active ? "var(--text-strong)" : "var(--text-body)",
      }}
      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
    >
      {Icon && <Icon className={"h-3.5 w-3.5 " + (iconClass || "")} />}
      {label}
      {count != null && (
        <span className="tabular rounded-full bg-black/20 px-1.5 text-[10px] text-slate-300">
          {count}
        </span>
      )}
    </button>
  );
}

function ActivityCard({ item, index, fbToken }) {
  const p = PLATFORMS[item.platform] || {};
  const t = TYPES[item.type] || {};
  const { Icon: PlatformIcon } = p;
  const { Icon: TypeIcon } = t;

  // Facebook replies come in two flavours, each with its own backend route:
  //  - comment -> POST /api/auth/facebook/comments (nested reply)
  //  - message -> POST /api/auth/facebook/messages (DM back to the sender;
  //    needs pages_messaging + the 24h messaging window to actually send)
  const canReplyComment =
    item.platform === "facebook" &&
    item.type === "comment" &&
    Boolean(fbToken && item.pageId && item.commentId);
  const canReplyMessage =
    item.platform === "facebook" &&
    item.type === "message" &&
    Boolean(fbToken && item.pageId && item.recipientId);
  const canReply = canReplyComment || canReplyMessage;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  // Once a reply lands we swap the composer for a small confirmation instead of
  // trying to splice the new reply into the fetched feed.
  const [sent, setSent] = useState(false);

  const sendReply = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    try {
      const endpoint = canReplyMessage
        ? "/api/auth/facebook/messages"
        : "/api/auth/facebook/comments";
      const payload = canReplyMessage
        ? { pageId: item.pageId, recipientId: item.recipientId, message }
        : {
            pageId: item.pageId,
            postId: item.postId,
            commentId: item.commentId, // reply nested under this comment
            message,
          };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fbToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "reply_failed");
      setSent(true);
      setDraft("");
      setOpen(false);
    } catch (e) {
      setError(e.message || "Reply failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{ "--i": index }}
      className="glass glass-hover flex gap-3 rounded-2xl p-4"
    >
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${p.tile || "border-white/10 bg-white/5"}`}
      >
        {PlatformIcon && <PlatformIcon className={`h-5 w-5 ${p.text || "text-slate-300"}`} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-white">{item.author}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
            {TypeIcon && <TypeIcon className="h-3 w-3" />}
            {t.label ? t.label.replace(/s$/, "") : item.type}
          </span>
          <span className="text-xs text-slate-500">{relativeTime(item.timestamp)}</span>
        </div>

        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">
          {item.text || <span className="italic text-slate-500">(no text)</span>}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {item.context && <span className="truncate">{item.context}</span>}
          {item.permalink && (
            <a
              href={item.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-slate-300 underline hover:text-white"
            >
              Open
            </a>
          )}
          {canReply && !sent && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-slate-300 underline hover:text-white"
            >
              {open ? "Cancel" : canReplyMessage ? "Reply in DM" : "Reply"}
            </button>
          )}
        </div>

        {sent && (
          <p className="mt-2 text-xs text-emerald-400">
            ✓ {canReplyMessage ? "Message sent." : "Reply sent."}
          </p>
        )}

        {canReply && open && !sent && (
          <div className="mt-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={
                canReplyMessage
                  ? `Message ${item.author}…`
                  : `Reply to ${item.author}…`
              }
              disabled={sending}
              className="field w-full resize-y text-sm"
            />
            {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={sendReply}
                disabled={sending || !draft.trim()}
                className="btn btn-primary"
              >
                {sending
                  ? "Sending…"
                  : canReplyMessage
                    ? "Send message"
                    : "Send reply"}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                disabled={sending}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
