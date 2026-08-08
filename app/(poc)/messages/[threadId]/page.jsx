"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiRefreshCw, FiSend } from "react-icons/fi";
import { getAccountsMap } from "../../lib/socialTokens";

const PAGE_SIZE = 25;

function clockTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export default function ThreadPage() {
  const { threadId } = useParams();
  const searchParams = useSearchParams();
  // The list page passes these along so this view doesn't have to re-resolve
  // which page the thread belongs to (pageId) or wait a round-trip to show a
  // title (name). pageId is required; name is only a placeholder until the
  // thread fetch returns the real participant.
  const pageId = searchParams.get("pageId");
  const nameHint = searchParams.get("name");

  const [token, setToken] = useState(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);

  const [messages, setMessages] = useState([]); // oldest first (display order)
  const [participant, setParticipant] = useState(nameHint ? { id: null, name: nameHint } : null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  // Set when the reply window has closed. `needsHumanAgent` narrows that to the
  // fixable case: the app isn't approved for the Human Agent tag that would
  // have extended the window to 7 days.
  const [outsideWindow, setOutsideWindow] = useState(false);
  const [needsHumanAgent, setNeedsHumanAgent] = useState(false);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getAccountsMap().then((map) => {
      if (cancelled) return;
      setToken(map.facebook?.accessToken || null);
      setTokenLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch one page of messages. `reset` restarts from the newest; otherwise we
  // page backwards into history and prepend, preserving scroll position so the
  // view doesn't jump while reading.
  const loadMessages = useCallback(
    async (reset = false) => {
      if (!token || !pageId || !threadId) return;
      if (loading) return;
      if (!reset && !hasMore) return;
      setLoading(true);
      setError(null);
      if (reset) {
        setMessages([]);
        setHasMore(true);
        setInitialLoaded(false);
      }
      const after = reset ? null : cursor;
      const el = scrollRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      try {
        const url = new URL("/api/auth/facebook/thread", window.location.origin);
        url.searchParams.set("pageId", pageId);
        url.searchParams.set("threadId", threadId);
        url.searchParams.set("limit", String(PAGE_SIZE));
        if (after) url.searchParams.set("after", after);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "load_failed");
        // Graph returns newest-first; reverse so the array reads oldest → newest.
        const batch = [...(data.messages || [])].reverse();
        setMessages((prev) => (reset ? batch : [...batch, ...prev]));
        if (data.participant) setParticipant(data.participant);
        setCursor(data.nextCursor);
        setHasMore(Boolean(data.nextCursor) && (data.messages?.length || 0) > 0);
        if (!reset && el) {
          // Keep the reader anchored: restore the offset from the bottom after
          // older messages were prepended above the viewport.
          requestAnimationFrame(() => {
            el.scrollTop += el.scrollHeight - prevHeight;
          });
        }
      } catch (e) {
        setError(e.message || "Failed to load messages");
        setHasMore(false);
      } finally {
        setLoading(false);
        setInitialLoaded(true);
      }
    },
    [token, pageId, threadId, cursor, hasMore, loading]
  );

  useEffect(() => {
    if (!token || !pageId || !threadId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMessages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pageId, threadId]);

  // Jump to the newest message once the first page lands.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (!initialLoaded || jumpedRef.current || messages.length === 0) return;
    jumpedRef.current = true;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [initialLoaded, messages.length]);

  // Load older history when the top of the scroller comes into view.
  const topSentinelRef = useRef(null);
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && initialLoaded) {
          loadMessages(false);
        }
      },
      { root: scrollRef.current, rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, initialLoaded, loadMessages]);

  const send = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || !participant?.id || !token || !pageId) return;
    setSending(true);
    setSendError(null);
    setOutsideWindow(false);
    setNeedsHumanAgent(false);
    try {
      const res = await fetch("/api/auth/facebook/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pageId, recipientId: participant.id, message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "send_failed");
        err.outsideWindow = Boolean(data.outsideWindow);
        err.needsHumanAgent = Boolean(data.needsHumanAgent);
        throw err;
      }
      // Show the sent message immediately rather than waiting for a refetch;
      // Graph doesn't return the full message object here.
      setMessages((prev) => [
        ...prev,
        {
          id: data.id || `local-${prev.length}`,
          text,
          fromPage: true,
          fromName: "",
          timestamp: new Date().toISOString(),
        },
      ]);
      setDraft("");
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
      );
    } catch (err) {
      setSendError(err.message || "Failed to send");
      setOutsideWindow(Boolean(err.outsideWindow));
      setNeedsHumanAgent(Boolean(err.needsHumanAgent));
    } finally {
      setSending(false);
    }
  };

  const title = participant?.name || nameHint || "Conversation";

  // Facebook's reply window is measured from the person's last message, so we
  // can tell before anything is typed whether a send can succeed. Only decide
  // once their messages are actually loaded — an empty list here means "not
  // known yet", not "expired".
  const lastInbound = messages.filter((m) => !m.fromPage).at(-1);
  const hoursSinceInbound = lastInbound?.timestamp
    ? (Date.now() - new Date(lastInbound.timestamp).getTime()) / 3600000
    : null;
  const windowExpired = hoursSinceInbound !== null && hoursSinceInbound >= 24;

  return (
    <div className="rise-in mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link href="/messages" className="btn btn-ghost px-2" aria-label="Back to messages">
          <FiArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-400/10 text-sm font-semibold text-indigo-300">
          {initials(title)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-white">{title}</h1>
          <p className="text-xs text-slate-500">Facebook Messenger</p>
        </div>
        <button
          onClick={() => {
            jumpedRef.current = false;
            loadMessages(true);
          }}
          disabled={loading}
          className="btn btn-ghost"
        >
          <FiRefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
        </button>
      </div>

      {!tokenLoaded ? null : !token ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-sm text-slate-400">Connect a Facebook account to read this thread.</p>
          <Link href="/connect" className="btn btn-primary mt-4">
            Go to Connect
          </Link>
        </div>
      ) : !pageId ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-sm text-slate-400">
            Missing page context — open this thread from the{" "}
            <Link href="/messages" className="text-indigo-300 underline">
              messages list
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {/* Message scroller */}
          <div
            ref={scrollRef}
            className="glass flex-1 space-y-3 overflow-y-auto rounded-2xl p-4"
          >
            <div ref={topSentinelRef} />
            {loading && !initialLoaded && (
              <p className="text-center text-sm text-slate-500">Loading conversation…</p>
            )}
            {loading && initialLoaded && (
              <p className="text-center text-xs text-slate-500">Loading older messages…</p>
            )}
            {!hasMore && initialLoaded && messages.length > 0 && (
              <p className="text-center text-xs text-slate-600">Start of conversation.</p>
            )}
            {error && (
              <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-300">
                {error}
                {/pages_messaging|permission/i.test(error) && (
                  <span className="mt-1 block text-rose-200/80">
                    Reading DMs needs the pages_messaging permission (Meta App Review).
                  </span>
                )}
              </div>
            )}
            {initialLoaded && messages.length === 0 && !error && (
              <p className="text-center text-sm text-slate-500">No messages in this thread.</p>
            )}

            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <form onSubmit={send} className="mt-3">
            {/* Warn up front rather than letting someone write a reply that
                Facebook is guaranteed to reject. */}
            {windowExpired && !sendError && (
              <div className="mb-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-200">
                The 24-hour reply window for this conversation has closed
                {lastInbound?.timestamp && ` — they last messaged ${clockTime(lastInbound.timestamp)}`}
                . Facebook won&apos;t deliver a reply until they message the Page again.
              </div>
            )}
            {sendError && (
              <div className="mb-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-300">
                {sendError}
                {needsHumanAgent ? (
                  <span className="mt-1 block text-rose-200/80">
                    Facebook only allows replies within 24h of the person&apos;s last message. The
                    Human Agent feature extends that to 7 days, but this app isn&apos;t approved
                    for it yet — request it under App Review → Permissions and Features.
                  </span>
                ) : outsideWindow ? (
                  <span className="mt-1 block text-rose-200/80">
                    Facebook closes a conversation to replies 7 days after the person&apos;s last
                    message. They&apos;ll need to message the Page again before you can respond.
                  </span>
                ) : (
                  /pages_messaging|permission/i.test(sendError) && (
                    <span className="mt-1 block text-rose-200/80">
                      Sending needs the pages_messaging permission (Meta App Review).
                    </span>
                  )
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter makes a new line — messenger habit.
                  if (e.key === "Enter" && !e.shiftKey) send(e);
                }}
                placeholder={`Message ${title}…`}
                className="field flex-1 resize-y text-sm"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim() || !participant?.id}
                className="btn btn-primary"
              >
                <FiSend className="h-4 w-4" />
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function Bubble({ message }) {
  const mine = message.fromPage;
  return (
    <div className={"flex " + (mine ? "justify-end" : "justify-start")}>
      <div className={"max-w-[75%] " + (mine ? "text-right" : "text-left")}>
        <div
          className={
            "inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm " +
            (mine
              ? "bg-indigo-500 text-white"
              : "border border-white/10 bg-white/5 text-slate-200")
          }
        >
          {message.text || <span className="italic text-slate-400">(no text)</span>}
        </div>
        <p className="mt-1 px-1 text-[11px] text-slate-500">{clockTime(message.timestamp)}</p>
      </div>
    </div>
  );
}
