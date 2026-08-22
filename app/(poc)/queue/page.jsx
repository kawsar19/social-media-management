"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaLinkedin, FaFacebook, FaThreads, FaInstagram, FaYoutube } from "react-icons/fa6";
import {
  FiCalendar,
  FiClock,
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiLoader,
  FiAlertTriangle,
  FiCheck,
  FiX,
  FiInbox,
  FiExternalLink,
  FiCornerUpLeft,
  FiLayers,
} from "react-icons/fi";
import { filterEnabledPages } from "../lib/enabledPages";
import { fetchAccounts, getAccountsMap } from "../lib/socialTokens";
import {
  fetchQueue,
  fetchQueueHistory,
  scheduleNewPost,
  rescheduleAt,
  updateQueuedPost,
  unschedulePost,
  removeQueuedPost,
  toDateInput,
  toTimeInput,
  fromDateTimeInputs,
  formatSlot,
  relativeToNow,
  groupByDay,
  dayLabel,
  suggestNextSlot,
} from "../lib/queue";

// Text-and-image destinations. YouTube is absent for the same reason it is on
// the Autopilot page: a YouTube post is a video upload, and the queue composes
// text. A queued post can still carry an image URL, which is what Instagram
// needs, so Instagram is offered but gated on having one.
const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn", Icon: FaLinkedin, accent: "text-sky-400" },
  { id: "facebook", label: "Facebook", Icon: FaFacebook, accent: "text-indigo-400" },
  { id: "instagram", label: "Instagram", Icon: FaInstagram, accent: "text-pink-400" },
  { id: "threads", label: "Threads", Icon: FaThreads, accent: "text-slate-100" },
];

const PLATFORM_ICONS = {
  linkedin: FaLinkedin,
  facebook: FaFacebook,
  instagram: FaInstagram,
  threads: FaThreads,
  youtube: FaYoutube,
};

export default function QueuePage() {
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  // Connections, so the composer only offers destinations that exist.
  const [accountMeta, setAccountMeta] = useState({});
  const [fbPages, setFbPages] = useState([]);
  const [fbToken, setFbToken] = useState(null);
  const [igAccounts, setIgAccounts] = useState([]);

  // Composer state. `composing` is "new" (single), "bulk", the id being edited,
  // or null for closed.
  const [composing, setComposing] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // A ticking clock, so "overdue" and the relative times ("in 2 hours") stay
  // true as the page sits open. Read from state rather than calling Date.now()
  // during render: a post crossing its scheduled moment has to re-render to
  // show it, and a value read mid-render doesn't trigger one.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const [upcoming, past] = await Promise.all([fetchQueue(), fetchQueueHistory()]);
      setQueue(upcoming);
      setHistory(past);
      // Cleared on success rather than up front, so a reload doesn't flash the
      // old error away before it's actually resolved.
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAccountsMap(), fetchAccounts()]).then(([map]) => {
      if (cancelled) return;
      setAccountMeta(map);
      setFbToken(map.facebook?.accessToken || null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Facebook Pages and Instagram accounts both hang off the Facebook token, so
  // they load together once it's known.
  useEffect(() => {
    if (!fbToken) return;
    let cancelled = false;

    const headers = { Authorization: `Bearer ${fbToken}` };

    fetch("/api/auth/facebook/pages", { headers })
      .then(async (res) => {
        const data = await res.json();
        if (!cancelled && res.ok) setFbPages(filterEnabledPages(data.pages || []));
      })
      .catch(() => {});

    fetch("/api/auth/instagram/accounts", { headers })
      .then(async (res) => {
        const data = await res.json();
        if (!cancelled && res.ok) setIgAccounts(data.accounts || []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [fbToken]);

  const connected = useMemo(
    () => ({
      linkedin: Boolean(accountMeta.linkedin),
      facebook: Boolean(accountMeta.facebook),
      instagram: Boolean(accountMeta.facebook) && igAccounts.length > 0,
      threads: Boolean(accountMeta.threads),
    }),
    [accountMeta, igAccounts]
  );

  const anyConnected =
    connected.linkedin || connected.facebook || connected.instagram || connected.threads;

  // Anything whose moment has passed but that hasn't published yet. The cron
  // runs every 15 minutes at best, so a few minutes of this is normal — it's
  // shown so a post stuck for hours is visibly different from one just waiting
  // for the next tick.
  const overdue = useMemo(
    () => queue.filter((p) => new Date(p.scheduledAt).getTime() < now),
    [queue, now]
  );

  async function withBusy(id, fn) {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function handleUnschedule(post) {
    return withBusy(post._id, () => unschedulePost(post._id));
  }

  function handleDelete(post) {
    if (!confirm("Delete this queued post? The content is lost.")) return;
    return withBusy(post._id, () => removeQueuedPost(post._id));
  }

  // Nudge a post a day earlier/later without opening the editor — the common
  // edit when a queue needs resequencing.
  function handleShift(post, days) {
    const next = new Date(post.scheduledAt);
    next.setDate(next.getDate() + days);
    return withBusy(post._id, () => rescheduleAt(post._id, next));
  }

  const groups = useMemo(() => groupByDay(queue), [queue]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg shadow-indigo-500/25">
                <FiCalendar className="h-4 w-4" />
              </span>
              Queue
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Write your posts now, give each one a date and time, and they publish
              themselves — no need to be online when they go out.
            </p>
          </div>
          {anyConnected && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setComposing("bulk")}
                className="btn btn-ghost text-xs"
              >
                <FiLayers className="h-3.5 w-3.5" />
                Bulk add
              </button>
              <button
                type="button"
                onClick={() => setComposing("new")}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:brightness-110 active:scale-95"
              >
                <FiPlus className="h-3.5 w-3.5" />
                Schedule a post
              </button>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="note note-danger mb-6" role="alert">
          <FiX className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {overdue.length > 0 && (
        <div className="note note-warn mb-6">
          <FiClock className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-relaxed">
            {overdue.length === 1 ? "1 post is" : `${overdue.length} posts are`} past
            their time and waiting for the next scheduler run. This is normal for up
            to an hour — after about 3 hours a post is marked missed rather than
            published far off schedule.
          </p>
        </div>
      )}

      {!anyConnected && !loading && (
        <div className="glass rounded-2xl px-6 py-12 text-center">
          <p className="text-sm text-slate-400">
            Connect an account first — a queued post needs somewhere to go.
          </p>
          <Link href="/connect" className="btn btn-ghost mt-4 text-xs">
            Go to Connect
            <FiExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <FiLoader className="h-4 w-4 animate-spin" />
          Loading your queue…
        </div>
      ) : (
        anyConnected &&
        queue.length === 0 && (
          <div className="surface-row rounded-2xl border-dashed px-6 py-12 text-center">
            <FiInbox className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">Nothing queued yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
              Use <strong>Bulk add</strong> to line up a month of posts in one go —
              paste them separated by a blank line and pick a daily time.
            </p>
            <button
              type="button"
              onClick={() => setComposing("new")}
              className="btn btn-ghost mt-4 text-xs"
            >
              <FiPlus className="h-3.5 w-3.5" />
              Schedule your first post
            </button>
          </div>
        )
      )}

      {queue.length > 0 && (
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-xs text-slate-500">
            {queue.length} post{queue.length === 1 ? "" : "s"} queued
          </p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.key}>
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {dayLabel(group.key)}
            </h2>
            <div className="space-y-2">
              {group.posts.map((post) => (
                <QueueRow
                  key={post._id}
                  post={post}
                  now={now}
                  busy={busyId === post._id}
                  onEdit={() => setComposing(post._id)}
                  onUnschedule={() => handleUnschedule(post)}
                  onDelete={() => handleDelete(post)}
                  onShift={(days) => handleShift(post, days)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {history.length > 0 && (
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="btn btn-ghost text-xs"
          >
            {showHistory ? "Hide" : "Show"} past scheduled posts ({history.length})
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.map((post) => (
                <HistoryRow key={post._id} post={post} />
              ))}
            </div>
          )}
        </div>
      )}

      {composing === "bulk" && (
        <BulkModal
          connected={connected}
          fbPages={fbPages}
          igAccounts={igAccounts}
          accountMeta={accountMeta}
          queue={queue}
          onClose={() => setComposing(null)}
          onSaved={async () => {
            setComposing(null);
            await load();
          }}
        />
      )}

      {composing && composing !== "bulk" && (
        <ComposeModal
          post={composing === "new" ? null : queue.find((p) => p._id === composing)}
          connected={connected}
          fbPages={fbPages}
          igAccounts={igAccounts}
          accountMeta={accountMeta}
          queue={queue}
          onClose={() => setComposing(null)}
          onSaved={async () => {
            setComposing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function QueueRow({ post, now, busy, onEdit, onUnschedule, onDelete, onShift }) {
  const isOverdue = new Date(post.scheduledAt).getTime() < now;
  const destinations = [
    ...new Set((post.targets || []).map((t) => t.destinationName || t.platform)),
  ];
  const platforms = [...new Set((post.targets || []).map((t) => t.platform))];

  return (
    <div className="glass glass-hover rounded-2xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isOverdue
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-sky-500/15 text-sky-300"
              }`}
            >
              <FiClock className="h-2.5 w-2.5" />
              {formatSlot(post.scheduledAt)}
            </span>
            <span className="text-[11px] text-slate-500">
              {isOverdue
                ? "waiting for scheduler"
                : relativeToNow(post.scheduledAt, new Date(now))}
            </span>
            <span className="flex items-center gap-1.5">
              {platforms.map((p) => {
                const Icon = PLATFORM_ICONS[p];
                return Icon ? (
                  <Icon key={p} className="h-3 w-3 text-slate-500" title={p} />
                ) : null;
              })}
            </span>
          </div>

          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-300">
            {post.content || <span className="italic text-slate-500">(media only)</span>}
          </p>

          {destinations.length > 0 && (
            <p className="mt-2 truncate text-[11px] text-slate-500">
              → {destinations.join(", ")}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton title="A day earlier" onClick={() => onShift(-1)} disabled={busy}>
            <span className="text-[13px] leading-none">−1d</span>
          </IconButton>
          <IconButton title="A day later" onClick={() => onShift(1)} disabled={busy}>
            <span className="text-[13px] leading-none">+1d</span>
          </IconButton>
          <IconButton title="Edit" onClick={onEdit} disabled={busy}>
            <FiEdit2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            title="Move back to drafts"
            onClick={onUnschedule}
            disabled={busy}
          >
            <FiCornerUpLeft className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Delete" onClick={onDelete} disabled={busy} danger>
            <FiTrash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function HistoryRow({ post }) {
  const failedTargets = (post.targets || []).filter((t) => t.status === "failed");
  const Icon =
    post.status === "published" ? FiCheck : post.status === "partial" ? FiAlertTriangle : FiX;
  const tone =
    post.status === "published"
      ? "text-emerald-400"
      : post.status === "partial"
        ? "text-amber-400"
        : "text-rose-400";

  return (
    <div className="surface-row rounded-xl px-3.5 py-3">
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-xs text-slate-300">{post.content}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Scheduled for {formatSlot(post.scheduledAt)}
            {failedTargets.length > 0 && (
              <span className="text-rose-400/80">
                {" "}
                — {failedTargets.map((t) => `${t.platform}: ${t.error}`).join("; ")}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, title, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-ghost h-8 min-h-0 w-8 rounded-lg p-0 ${
        danger ? "btn-ghost-danger" : ""
      }`}
    >
      {children}
    </button>
  );
}

// ── destination picking ─────────────────────────────────────────────────────
//
// Shared by both modals: a queued post and a bulk batch address the same places
// in the same way, and two copies of this would drift.

const emptyDestinations = () => ({
  platforms: { linkedin: false, facebook: false, instagram: false, threads: false },
  pageIds: [],
  igId: "",
});

// Read a saved post's targets back into the picker's shape, so editing one
// starts from where it was rather than from nothing.
function destinationsFromTargets(targets = []) {
  const dest = emptyDestinations();
  for (const t of targets) {
    if (dest.platforms[t.platform] === undefined) continue;
    dest.platforms[t.platform] = true;
    if (t.platform === "facebook" && t.destinationId) dest.pageIds.push(t.destinationId);
    if (t.platform === "instagram" && t.destinationId) dest.igId = t.destinationId;
  }
  return dest;
}

// The picker's shape → the DB target list, matching what the publish route
// expects. Mirrors buildTargets() in the Publish page; Facebook expands to one
// target per selected Page.
function targetsFromDestinations(dest, { accountMeta, fbPages, igAccounts }) {
  const targets = [];
  for (const p of PLATFORMS) {
    if (!dest.platforms[p.id]) continue;

    if (p.id === "facebook") {
      for (const pageId of dest.pageIds) {
        const page = fbPages.find((fp) => fp.id === pageId);
        targets.push({
          platform: "facebook",
          accountName: accountMeta.facebook?.platformName,
          destinationId: pageId,
          destinationName: page?.name,
        });
      }
      continue;
    }

    if (p.id === "instagram") {
      const acc = igAccounts.find((a) => a.id === dest.igId) || igAccounts[0];
      if (!acc) continue;
      targets.push({
        platform: "instagram",
        destinationId: acc.id,
        destinationName: acc.username ? `@${acc.username}` : acc.name,
      });
      continue;
    }

    const meta = accountMeta[p.id];
    targets.push({
      platform: p.id,
      accountName: meta?.platformName,
      destinationId: meta?.platformId,
    });
  }
  return targets;
}

// Why a set of destinations can't be saved yet, or null when it's fine. Written
// as one function so both modals refuse for the same reasons with the same
// words.
function destinationError(dest, { fbPages, igAccounts, hasMedia }) {
  const chosen = PLATFORMS.filter((p) => dest.platforms[p.id]);
  if (chosen.length === 0) return "Pick at least one destination.";
  if (dest.platforms.facebook && dest.pageIds.length === 0) {
    return fbPages.length === 0
      ? "No Facebook Pages available on this account."
      : "Pick at least one Facebook Page.";
  }
  if (dest.platforms.instagram) {
    if (igAccounts.length === 0) return "No Instagram account is linked.";
    // Instagram's API has no text-only post — it publishes a media container,
    // so a caption with nothing to caption is rejected at publish time. Better
    // to say so while the post is still being written.
    if (!hasMedia) return "Instagram needs an image or video URL.";
  }
  return null;
}

function DestinationPicker({ dest, setDest, connected, fbPages, igAccounts }) {
  function togglePlatform(id) {
    setDest((d) => ({ ...d, platforms: { ...d.platforms, [id]: !d.platforms[id] } }));
  }

  function togglePage(pageId) {
    setDest((d) => ({
      ...d,
      pageIds: d.pageIds.includes(pageId)
        ? d.pageIds.filter((p) => p !== pageId)
        : [...d.pageIds, pageId],
    }));
  }

  return (
    <div className="space-y-2">
      {PLATFORMS.map((p) => {
        const isConnected = connected[p.id];
        return (
          <div key={p.id}>
            <label
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs ${
                isConnected
                  ? "cursor-pointer surface-row"
                  : "cursor-not-allowed opacity-40"
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(dest.platforms[p.id])}
                onChange={() => togglePlatform(p.id)}
                disabled={!isConnected}
                className="h-3.5 w-3.5 accent-indigo-500"
              />
              <p.Icon className={`h-4 w-4 ${p.accent}`} />
              <span className="text-slate-200">{p.label}</span>
              {!isConnected && (
                <span className="ml-auto text-[10px] text-slate-500">not connected</span>
              )}
            </label>

            {p.id === "facebook" && dest.platforms.facebook && fbPages.length > 0 && (
              <div className="mt-1.5 ml-6 space-y-1">
                {fbPages.map((page) => (
                  <label
                    key={page.id}
                    className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-400"
                  >
                    <input
                      type="checkbox"
                      checked={dest.pageIds.includes(page.id)}
                      onChange={() => togglePage(page.id)}
                      className="h-3 w-3 accent-indigo-500"
                    />
                    {page.name}
                  </label>
                ))}
              </div>
            )}

            {p.id === "instagram" && dest.platforms.instagram && igAccounts.length > 0 && (
              <div className="mt-1.5 ml-6">
                <select
                  value={dest.igId || igAccounts[0]?.id || ""}
                  onChange={(e) => setDest((d) => ({ ...d, igId: e.target.value }))}
                  className="field text-xs"
                >
                  {igAccounts.map((a) => (
                    <option
                      key={a.id}
                      value={a.id}
                      style={{ background: "var(--background)", color: "var(--text-body)" }}
                    >
                      {a.username ? `@${a.username}` : a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Escape-to-close, matching the other dialogs in the app. Bound to the window
// rather than the panel so it works without the dialog holding focus.
function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function ModalShell({ chip, ChipIcon, title, subtitle, onClose, children, footer, label }) {
  useEscape(onClose);
  return (
    // .ai-overlay / .ai-panel are the app's dialog surfaces — they read from the
    // theme tokens, so this panel turns light with the rest of the UI.
    <div
      className="ai-overlay items-start overflow-y-auto py-8"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop dismisses — a
        // drag out of a textarea shouldn't throw away a half-written post.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ai-panel max-w-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ai-panel-head">
          <div className="ai-glow" aria-hidden />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="ai-chip">
                <ChipIcon className="h-3.5 w-3.5" /> {chip}
              </span>
              <h2 className="mt-2.5 text-[1.35rem] font-bold leading-tight tracking-tight text-white">
                {title}
              </h2>
              <p className="pretty mt-1 text-sm text-slate-400">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ai-close shrink-0"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="ai-panel-body space-y-5">{children}</div>

        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

function ComposeModal({
  post,
  connected,
  fbPages,
  igAccounts,
  accountMeta,
  queue,
  onClose,
  onSaved,
}) {
  const isNew = !post;
  // The suggested slot is computed once, on open. Recomputing it as the queue
  // reloads would move the date under the user mid-edit.
  const [initialSlot] = useState(() =>
    post ? new Date(post.scheduledAt) : suggestNextSlot(queue)
  );

  const [text, setText] = useState(post?.content || "");
  const [mediaUrl, setMediaUrl] = useState(post?.mediaUrl || "");
  const [mediaType, setMediaType] = useState(post?.mediaType || "image");
  const [date, setDate] = useState(toDateInput(initialSlot));
  const [time, setTime] = useState(toTimeInput(initialSlot));
  const [dest, setDest] = useState(() =>
    post ? destinationsFromTargets(post.targets) : emptyDestinations()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (saving) return;
    setError("");

    const when = fromDateTimeInputs(date, time);
    if (!when) return setError("Pick a date and a time.");
    if (!text.trim() && !mediaUrl.trim()) {
      return setError("Write something, or add media.");
    }

    const destError = destinationError(dest, {
      fbPages,
      igAccounts,
      hasMedia: Boolean(mediaUrl.trim()),
    });
    if (destError) return setError(destError);

    // A time in the past would be published on the very next cron tick, which
    // is almost never what someone typing a date meant. Refusing is kinder than
    // publishing immediately and calling it scheduled.
    if (when.getTime() < Date.now()) {
      return setError("That time has already passed — pick a future one.");
    }

    const targets = targetsFromDestinations(dest, { accountMeta, fbPages, igAccounts });
    const payload = {
      content: text,
      targets,
      ...(mediaUrl.trim() ? { mediaUrl: mediaUrl.trim(), mediaType } : {}),
    };

    setSaving(true);
    try {
      if (isNew) {
        await scheduleNewPost(payload, when);
      } else {
        await updateQueuedPost(post._id, {
          ...payload,
          status: "scheduled",
          scheduledAt: when.toISOString(),
        });
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      chip="Queue"
      ChipIcon={FiCalendar}
      title={isNew ? "Schedule a post" : "Edit queued post"}
      subtitle="It publishes on its own at the time you pick."
      label={isNew ? "Schedule a post" : "Edit queued post"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary text-xs"
          >
            {saving && <FiLoader className="h-3.5 w-3.5 animate-spin" />}
            {isNew ? "Add to queue" : "Save"}
          </button>
        </>
      }
    >
      {error && (
        <div className="note note-danger" role="alert">
          <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <Field label="Post">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="What do you want to say?"
          className="field resize-y text-sm"
        />
        <p className="mt-1.5 text-[10px] text-slate-500">{text.length} characters</p>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field text-sm"
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="field text-sm"
          />
        </Field>
      </div>
      <p className="-mt-3 text-[10px] text-slate-500">
        Your local time. The scheduler checks every few minutes, so a post can go
        out a little after its slot.
      </p>

      <Field
        label="Media URL"
        hint="Optional — a public https image or video URL. Required for Instagram."
      >
        <input
          type="url"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="https://…"
          className="field text-sm"
        />
        {mediaUrl.trim() && (
          <div className="mt-2 flex gap-3">
            {["image", "video"].map((t) => (
              <label
                key={t}
                className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400"
              >
                <input
                  type="radio"
                  name="mediaType"
                  checked={mediaType === t}
                  onChange={() => setMediaType(t)}
                  className="h-3 w-3 accent-indigo-500"
                />
                {t}
              </label>
            ))}
          </div>
        )}
      </Field>

      <Field label="Publish to">
        <DestinationPicker
          dest={dest}
          setDest={setDest}
          connected={connected}
          fbPages={fbPages}
          igAccounts={igAccounts}
        />
      </Field>
    </ModalShell>
  );
}

// Bulk add — the reason this page exists. Someone lining up 30 posts should not
// open a modal 30 times, so this takes many posts at once and spreads them over
// a repeating slot pattern.
function BulkModal({ connected, fbPages, igAccounts, accountMeta, queue, onClose, onSaved }) {
  const [raw, setRaw] = useState("");
  // Posts are separated by a blank line, so a single post can still contain the
  // line breaks that make it readable on the platform.
  const [startDate, setStartDate] = useState(() => toDateInput(suggestNextSlot(queue)));
  const [time, setTime] = useState("09:00");
  const [everyDays, setEveryDays] = useState(1);
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [dest, setDest] = useState(emptyDestinations);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [error, setError] = useState("");

  const posts = useMemo(
    () =>
      raw
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter(Boolean),
    [raw]
  );

  // The slots these posts would land in, computed live so the preview below is
  // exactly what saving will produce rather than a description of it.
  const slots = useMemo(() => {
    const start = fromDateTimeInputs(startDate, time);
    if (!start) return [];
    const out = [];
    const cursor = new Date(start);
    const step = Math.max(1, Number(everyDays) || 1);
    for (let i = 0; i < posts.length; i++) {
      if (skipWeekends) {
        // 0=Sun, 6=Sat. Nudge forward to Monday rather than skipping the post,
        // so every post still goes out — just not at the weekend.
        while (cursor.getDay() === 0 || cursor.getDay() === 6) {
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + step);
    }
    return out;
  }, [posts.length, startDate, time, everyDays, skipWeekends]);

  async function handleSave() {
    if (saving) return;
    setError("");

    if (posts.length === 0) {
      return setError("Paste at least one post, separated by a blank line.");
    }
    if (slots.length === 0) return setError("Pick a start date and a time.");
    if (slots[0].getTime() < Date.now()) {
      return setError("The first slot has already passed — pick a later start.");
    }

    const destError = destinationError(dest, {
      fbPages,
      igAccounts,
      // Bulk posts are text-only, so Instagram can't be a destination here.
      hasMedia: false,
    });
    if (destError) return setError(destError);

    const targets = targetsFromDestinations(dest, { accountMeta, fbPages, igAccounts });

    setSaving(true);
    setProgress({ done: 0, total: posts.length });
    try {
      // Sequential rather than Promise.all: 30 parallel writes is a burst the
      // serverless DB connection doesn't need, and a partial failure is far
      // easier to explain when the successes are a prefix.
      for (let i = 0; i < posts.length; i++) {
        await scheduleNewPost({ content: posts[i], targets }, slots[i]);
        setProgress({ done: i + 1, total: posts.length });
      }
      await onSaved();
    } catch (err) {
      // Whatever was written before the failure is already queued, so say so —
      // otherwise a retry from the top would duplicate those posts.
      setError(
        `${err.message} — ${progress?.done || 0} of ${posts.length} were queued. ` +
          "Remove those from the box before trying again."
      );
      setSaving(false);
    }
  }

  return (
    <ModalShell
      chip="Bulk add"
      ChipIcon={FiLayers}
      title="Queue many posts at once"
      subtitle="Paste them all, separated by a blank line."
      label="Bulk add posts to the queue"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || posts.length === 0}
            className="btn btn-primary text-xs"
          >
            {saving && <FiLoader className="h-3.5 w-3.5 animate-spin" />}
            {saving && progress
              ? `Queueing ${progress.done}/${progress.total}…`
              : `Queue ${posts.length || ""} post${posts.length === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      {error && (
        <div className="note note-danger" role="alert">
          <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <Field
        label="Posts"
        hint="One blank line between posts. Line breaks inside a post are kept."
      >
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          placeholder={"First post goes here.\n\nSecond post goes here.\n\nThird…"}
          className="field resize-y font-mono text-xs"
        />
        <p className="mt-1.5 text-[10px] text-slate-500">
          {posts.length} post{posts.length === 1 ? "" : "s"} detected
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starting">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="field text-sm"
          />
        </Field>
        <Field label="At">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="field text-sm"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="One post every">
          <select
            value={everyDays}
            onChange={(e) => setEveryDays(Number(e.target.value))}
            className="field text-sm"
          >
            {[1, 2, 3, 7].map((n) => (
              <option
                key={n}
                value={n}
                style={{ background: "var(--background)", color: "var(--text-body)" }}
              >
                {n === 1 ? "day" : n === 7 ? "week" : `${n} days`}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={skipWeekends}
              onChange={(e) => setSkipWeekends(e.target.checked)}
              className="h-3.5 w-3.5 accent-indigo-500"
            />
            Skip weekends
          </label>
        </div>
      </div>

      {slots.length > 0 && (
        <div className="surface-row rounded-lg px-3.5 py-3">
          <p className="text-[11px] font-medium text-slate-300">
            {slots.length} slot{slots.length === 1 ? "" : "s"}, {formatSlot(slots[0])} →{" "}
            {formatSlot(slots[slots.length - 1])}
          </p>
          <ul className="mt-2 space-y-1">
            {slots.slice(0, 3).map((slot, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-slate-500">
                <span className="shrink-0 text-slate-400">{formatSlot(slot)}</span>
                <span className="truncate">{posts[i]}</span>
              </li>
            ))}
            {slots.length > 3 && (
              <li className="text-[11px] text-slate-600">
                …and {slots.length - 3} more
              </li>
            )}
          </ul>
        </div>
      )}

      <Field label="Publish all of them to">
        <DestinationPicker
          dest={dest}
          setDest={setDest}
          connected={{ ...connected, instagram: false }}
          fbPages={fbPages}
          igAccounts={igAccounts}
        />
        <p className="mt-1.5 text-[10px] text-slate-500">
          Instagram is unavailable here — it needs media on every post, which bulk
          add doesn&apos;t collect. Schedule those one at a time.
        </p>
      </Field>
    </ModalShell>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-300">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}
