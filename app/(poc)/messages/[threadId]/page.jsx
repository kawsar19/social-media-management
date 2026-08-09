"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiLink, FiPaperclip, FiRefreshCw, FiSend, FiZap } from "react-icons/fi";
import { markThreadSeen } from "../../lib/seenThreads";
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
  // AI rewrite: pick a language and the rough draft is rewritten into it. The
  // result is held separately from `draft` so the original stays editable and
  // the rewrite can be previewed — and discarded — before anything is sent.
  const [language, setLanguage] = useState("");
  const [preview, setPreview] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  // Set when the reply window has closed. `needsHumanAgent` narrows that to the
  // fixable case: the app isn't approved for the Human Agent tag that would
  // have extended the window to 7 days.
  const [outsideWindow, setOutsideWindow] = useState(false);
  const [needsHumanAgent, setNeedsHumanAgent] = useState(false);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  // Clock for the reply-window check below. Reading Date.now() during render
  // would be impure; this also lets the notice appear on its own if the window
  // closes while the thread is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

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

  // Opening a thread marks it read on Facebook's side too (blue "Seen"), the
  // same as opening a chat in Messenger. Best-effort: a failure here doesn't
  // affect reading, so it stays silent. Once per participant, not per refresh.
  const seenSentRef = useRef(null);
  useEffect(() => {
    const recipientId = participant?.id;
    if (!token || !pageId || !recipientId) return;
    if (seenSentRef.current === recipientId) return;
    seenSentRef.current = recipientId;
    markThreadSeen(threadId);
    fetch("/api/auth/facebook/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pageId, recipientId }),
    }).catch(() => {});
  }, [token, pageId, participant?.id, threadId]);

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

  // Rewrite the draft into `lang`. Selecting a language triggers this; the
  // result lands in `preview` and is what gets sent unless it's discarded.
  const rewrite = useCallback(
    async (lang) => {
      const text = draft.trim();
      if (!text || !lang) return;
      setRewriting(true);
      setRewriteError(null);
      try {
        const res = await fetch("/api/ai/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language: lang }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "rewrite_failed");
        setPreview(data.text || "");
      } catch (err) {
        setRewriteError(err.message || "Couldn't rewrite that");
        setPreview("");
      } finally {
        setRewriting(false);
      }
    },
    [draft]
  );

  const onLanguageChange = (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    setPreview("");
    setRewriteError(null);
    if (lang) rewrite(lang);
  };

  const send = async (e) => {
    e.preventDefault();
    // The rewritten version is what goes out once one exists; the raw draft is
    // only a means to it.
    const text = (preview || draft).trim();
    if (!text || sending || rewriting || !participant?.id || !token || !pageId) return;
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
      setPreview("");
      setLanguage("");
      setRewriteError(null);
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
  const windowExpired =
    Boolean(lastInbound?.timestamp) &&
    now - new Date(lastInbound.timestamp).getTime() >= 24 * 3600000;

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
            {/* AI rewrite controls */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <FiZap className="h-4 w-4 text-indigo-400" />
              <label htmlFor="rewrite-lang" className="text-xs text-slate-400">
                Rewrite as
              </label>
              <select
                id="rewrite-lang"
                value={language}
                onChange={onLanguageChange}
                disabled={!draft.trim() || rewriting}
                className="field w-auto min-w-36 text-xs"
              >
                <option value="">Off — send as typed</option>
                <option value="bangla">সুন্দর বাংলা</option>
                <option value="english">Clean English</option>
                <option value="banglish">Banglish</option>
              </select>
              {rewriting && <span className="text-xs text-slate-500">Rewriting…</span>}
              {preview && !rewriting && (
                <button
                  type="button"
                  onClick={() => rewrite(language)}
                  className="text-xs text-indigo-300 underline"
                >
                  Try again
                </button>
              )}
            </div>

            {rewriteError && (
              <div className="mb-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-300">
                {rewriteError}
                <span className="mt-1 block text-rose-200/80">
                  Your original message is unchanged — you can still send it as typed.
                </span>
              </div>
            )}

            {/* Preview of what will actually be sent. Shown separately from the
                draft so the difference is visible before committing to it. */}
            {preview && (
              <div className="mb-2 rounded-xl border border-indigo-400/30 bg-indigo-400/10 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-indigo-300">
                    This will be sent instead
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPreview("");
                      setLanguage("");
                    }}
                    className="text-xs text-slate-400 underline hover:text-slate-200"
                  >
                    Discard
                  </button>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{preview}</p>
              </div>
            )}

            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // Editing the draft invalidates the rewrite — sending a
                  // preview of older text would be a nasty surprise.
                  if (preview) setPreview("");
                  if (rewriteError) setRewriteError(null);
                }}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter makes a new line — messenger habit.
                  if (e.key === "Enter" && !e.shiftKey) send(e);
                }}
                placeholder={
                  preview ? "Your draft — the rewrite above is what sends" : `Message ${title}…`
                }
                className="field flex-1 resize-y text-sm"
              />
              <button
                type="submit"
                disabled={sending || rewriting || !draft.trim() || !participant?.id}
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
  const attachments = message.attachments || [];
  const hasText = Boolean(message.text);
  return (
    <div className={"flex " + (mine ? "justify-end" : "justify-start")}>
      <div className={"max-w-[75%] " + (mine ? "text-right" : "text-left")}>
        {attachments.length > 0 && (
          <div className={"mb-1 flex flex-col gap-1 " + (mine ? "items-end" : "items-start")}>
            {attachments.map((att, i) => (
              <Attachment key={att.url || i} attachment={att} />
            ))}
          </div>
        )}
        {/* A photo-only message has no text bubble — the image is the message,
            so an empty "(no text)" bubble under it would just be noise. */}
        {(hasText || attachments.length === 0) && (
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
        )}
        <p className="mt-1 px-1 text-[11px] text-slate-500">{clockTime(message.timestamp)}</p>
      </div>
    </div>
  );
}

function Attachment({ attachment: att }) {
  if (att.kind === "image") {
    return (
      <a href={att.fullUrl || att.url} target="_blank" rel="noreferrer" className="block">
        {/* Plain <img>: these are Graph CDN URLs on domains next/image isn't
            configured for, and they expire, so optimization buys nothing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={att.name || "Attachment"}
          className="max-h-64 max-w-full rounded-2xl border border-white/10 object-cover"
        />
      </a>
    );
  }
  if (att.kind === "video") {
    return (
      <video
        src={att.url}
        controls
        className="max-h-64 max-w-full rounded-2xl border border-white/10"
      />
    );
  }
  if (att.kind === "audio") {
    return <audio src={att.url} controls className="max-w-full" />;
  }
  // Files and link previews share a chip presentation.
  const Icon = att.kind === "link" ? FiLink : FiPaperclip;
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10"
    >
      <Icon className="h-4 w-4 flex-shrink-0 text-slate-400" />
      <span className="truncate">{att.name || att.url}</span>
    </a>
  );
}
