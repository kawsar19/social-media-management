"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaFacebook, FaInstagram, FaThreads, FaYoutube } from "react-icons/fa6";
import { FiMessageCircle, FiRefreshCw } from "react-icons/fi";
import { filterEnabledPages } from "../lib/enabledPages";
import { applySeenState } from "../lib/seenThreads";
import { getAccountsMap } from "../lib/socialTokens";

// One tab per platform. `supported` marks whether we can actually list DM
// threads today — only Facebook works without further Meta App Review, so the
// others render an explanatory notice instead of an empty list.
const TABS = [
  { key: "facebook", name: "Facebook", Icon: FaFacebook, accent: "text-indigo-400", supported: true },
  { key: "instagram", name: "Instagram", Icon: FaInstagram, accent: "text-pink-400", supported: false, reason: "Instagram DMs need the instagram_manage_messages permission (Meta App Review)." },
  { key: "threads", name: "Threads", Icon: FaThreads, accent: "text-slate-100", supported: false, reason: "Threads has no direct-message API." },
  { key: "youtube", name: "YouTube", Icon: FaYoutube, accent: "text-rose-400", supported: false, reason: "YouTube has no direct messages — only comments." },
];

const PAGE_SIZE = 20;

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export default function MessagesPage() {
  const [fbToken, setFbToken] = useState(null);
  const [pages, setPages] = useState([]); // all enabled Facebook pages
  const [pageId, setPageId] = useState(null); // the page we currently list DMs for
  const [pageError, setPageError] = useState(null);

  const [tab, setTab] = useState("facebook");

  const [threads, setThreads] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false); // a page fetch is in flight
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState(null);

  const activeTab = useMemo(() => TABS.find((t) => t.key === tab), [tab]);

  // Load the Facebook token, then resolve the first enabled page — that's the
  // page whose Messenger threads we list.
  useEffect(() => {
    let cancelled = false;
    getAccountsMap().then(async (map) => {
      if (cancelled) return;
      const token = map.facebook?.accessToken || null;
      setFbToken(token);
      if (!token) return;
      try {
        const res = await fetch("/api/auth/facebook/pages", {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json());
        const enabled = filterEnabledPages(res.pages || []);
        if (cancelled) return;
        setPages(enabled);
        if (enabled[0]) setPageId(enabled[0].id);
        else setPageError("No Facebook page connected.");
      } catch {
        if (!cancelled) setPageError("Couldn't load your Facebook pages.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch one page of threads. `reset` starts over (tab switch / refresh);
  // otherwise it appends the next cursor's worth for infinite scroll.
  const loadThreads = useCallback(
    async (reset = false) => {
      if (!activeTab?.supported || !fbToken || !pageId) return;
      if (loading) return;
      if (!reset && !hasMore) return;
      setLoading(true);
      setError(null);
      if (reset) {
        // Starting over (tab switch / refresh / new page): clear the list and
        // paging state so appended results don't mix with the previous source.
        setThreads([]);
        setHasMore(true);
        setInitialLoaded(false);
      }
      const after = reset ? null : cursor;
      try {
        const url = new URL("/api/auth/facebook/conversations", window.location.origin);
        url.searchParams.set("pageId", pageId);
        url.searchParams.set("limit", String(PAGE_SIZE));
        if (after) url.searchParams.set("after", after);
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${fbToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "load_failed");
        // Threads opened in this browser shouldn't show as unread while
        // Facebook's own count catches up to the mark_seen call.
        const batch = applySeenState(data.threads || []);
        setThreads((prev) => (reset ? batch : [...prev, ...batch]));
        setCursor(data.nextCursor);
        setHasMore(Boolean(data.nextCursor) && (data.threads?.length || 0) > 0);
      } catch (e) {
        setError(e.message || "Failed to load messages");
        setHasMore(false);
      } finally {
        setLoading(false);
        setInitialLoaded(true);
      }
    },
    [activeTab, fbToken, pageId, cursor, hasMore, loading]
  );

  // Initial load / reload when the page (and thus DM source) becomes known.
  // loadThreads(true) handles clearing the list + paging state itself.
  useEffect(() => {
    if (tab !== "facebook" || !fbToken || !pageId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadThreads(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbToken, pageId, tab]);

  // Returning from a thread is a client-side navigation, so this list can
  // re-render from memory with its pre-visit unread dots. Re-apply the locally
  // seen set when the page becomes visible again to clear them.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      setThreads((prev) => applySeenState(prev));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  // Infinite scroll: load more when the sentinel at the list bottom appears.
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && initialLoaded) {
          loadThreads(false);
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, initialLoaded, loadThreads]);

  const manualRefresh = () => {
    if (tab !== "facebook") return;
    loadThreads(true);
  };

  return (
    <div className="rise-in mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="balance flex items-center gap-3 text-3xl font-bold text-white">
            <FiMessageCircle className="h-7 w-7 text-indigo-400" />
            Messages
          </h1>
          <p className="pretty mt-2 text-slate-400">
            Direct-message threads per platform — like a unified Messenger.
          </p>
        </div>
        {activeTab?.supported && (
          <button onClick={manualRefresh} disabled={loading} className="btn btn-ghost">
            <FiRefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
            Refresh
          </button>
        )}
      </div>

      {/* Platform tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          const { Icon } = t;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: active ? "var(--fill-track)" : "var(--fill-subtle)",
                borderColor: active ? "var(--glass-border-hover)" : "var(--glass-border)",
                color: active ? "var(--text-strong)" : "var(--text-body)",
              }}
              className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
            >
              <Icon className={`h-4 w-4 ${t.accent}`} />
              {t.name}
            </button>
          );
        })}
      </div>

      {/* Page filter — pick which Facebook page's Messenger threads to show.
          Only meaningful on the Facebook tab with more than one page. */}
      {activeTab?.supported && fbToken && pages.length > 1 && (
        <div className="mb-6 flex items-center gap-2">
          <label htmlFor="page-filter" className="text-sm text-slate-400">
            Page
          </label>
          <select
            id="page-filter"
            value={pageId || ""}
            onChange={(e) => setPageId(e.target.value)}
            className="field w-auto min-w-52 text-sm"
          >
            {pages.map((pg) => (
              <option key={pg.id} value={pg.id}>
                {pg.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Not-connected / no-page notices */}
      {!fbToken && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">
          <p className="text-sm">Connect a Facebook account to see messages.</p>
          <Link href="/connect" className="btn btn-primary">
            Go to Connect
          </Link>
        </div>
      )}

      {/* Unsupported platform notice */}
      {activeTab && !activeTab.supported && (
        <div className="glass rounded-2xl p-10 text-center">
          <activeTab.Icon className={`mx-auto mb-3 h-8 w-8 ${activeTab.accent}`} />
          <p className="text-sm text-slate-400">{activeTab.reason}</p>
        </div>
      )}

      {/* Facebook thread list */}
      {activeTab?.supported && fbToken && (
        <>
          {pageError && (
            <p className="mb-4 text-sm text-amber-300">{pageError}</p>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-300">
              {error}
              {/pages_messaging|permission/i.test(error) && (
                <span className="mt-1 block text-rose-200/80">
                  Sending/reading DMs needs the pages_messaging permission (Meta App Review).
                </span>
              )}
            </div>
          )}

          {!initialLoaded && loading ? (
            <p className="text-sm text-slate-500">Loading conversations…</p>
          ) : initialLoaded && threads.length === 0 && !error ? (
            <div className="glass rounded-2xl p-10 text-center">
              <FiMessageCircle className="mx-auto mb-3 h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-400">No conversations yet.</p>
            </div>
          ) : (
            <div className="glass overflow-hidden rounded-2xl">
              {threads.map((th, i) => (
                <ThreadRow
                  key={th.id}
                  thread={th}
                  pageId={pageId}
                  last={i === threads.length - 1}
                />
              ))}
              {/* Infinite-scroll sentinel + status */}
              <div ref={sentinelRef} />
              {loading && initialLoaded && (
                <p className="p-4 text-center text-xs text-slate-500">Loading more…</p>
              )}
              {!hasMore && threads.length > 0 && (
                <p className="p-4 text-center text-xs text-slate-600">
                  You&apos;ve reached the end.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ThreadRow({ thread, pageId, last }) {
  // pageId and name ride along in the query string so the thread view can fetch
  // immediately and render a title before its own request resolves.
  const href = `/messages/${encodeURIComponent(thread.id)}?pageId=${encodeURIComponent(
    pageId || ""
  )}&name=${encodeURIComponent(thread.name || "")}`;
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5 " +
        (last ? "" : "border-b border-white/5")
      }
    >
      {/* Avatar */}
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-400/10 text-sm font-semibold text-indigo-300">
        {initials(thread.name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-white">{thread.name}</span>
          {thread.unread && (
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-indigo-400" />
          )}
          <span className="ml-auto flex-shrink-0 text-xs text-slate-500">
            {relativeTime(thread.timestamp)}
          </span>
        </div>
        <p
          className={
            "truncate text-sm " +
            (thread.unread ? "text-slate-200" : "text-slate-400")
          }
        >
          {thread.snippet || <span className="italic text-slate-600">(no text)</span>}
        </p>
      </div>
    </Link>
  );
}
