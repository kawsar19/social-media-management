"use client";

import { useState } from "react";

// Comments panel for a single YouTube video: lists top-level comment threads
// with their replies, and lets the user reply to a thread. Lazily loads on
// first expand. Mirrors the Facebook PostComments component, but the YouTube
// route only supports reading + replying (no delete), so we don't render
// delete controls here.
export default function YouTubeComments({ ytToken, videoId }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Per-thread reply: which thread's reply box is open + its text.
  const [replyToId, setReplyToId] = useState(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    fetch(`/api/auth/youtube/comments?videoId=${encodeURIComponent(videoId)}`, {
      headers: { Authorization: `Bearer ${ytToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setError(data.error || "Failed to load comments");
        else setComments(data.comments || []);
      })
      .catch(() => setError("Failed to load comments"))
      .finally(() => {
        setLoading(false);
        setLoaded(true);
      });
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  }

  async function sendReply(parentId) {
    if (!reply.trim()) return;
    setReplying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/youtube/comments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ytToken}`,
          "Content-Type": "application/json",
        },
        // parentId is the top-level comment (thread) id -> YouTube nests the reply.
        body: JSON.stringify({ parentId, text: reply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reply");
      } else {
        setReply("");
        setReplyToId(null);
        load(); // refresh so the new reply shows
      }
    } catch {
      setError("Network error while replying");
    } finally {
      setReplying(false);
    }
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <button
        onClick={toggle}
        className="text-sm font-medium text-slate-400 transition-colors hover:text-rose-300"
      >
        💬 {open ? "Hide comments" : "Comments"}
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-white/5 p-4">
          {error && (
            <p className="break-all rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
              {error} — if this looks like an auth error, reconnect YouTube
              (Google tokens expire after about an hour).
            </p>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-slate-500">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    {c.authorImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.authorImage}
                        alt=""
                        // yt3.ggpht.com 403s when a referer is sent; suppress it.
                        referrerPolicy="no-referrer"
                        className="app-img h-8 w-8 flex-shrink-0 rounded-full object-cover ring-1 ring-white/10"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {c.author}
                      </p>
                      <p
                        className="pretty break-words text-sm text-slate-300"
                        // YouTube returns textDisplay as HTML (links, <br>, etc.).
                        dangerouslySetInnerHTML={{ __html: c.text || "" }}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        👍 <span className="tabular">{c.likeCount ?? 0}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setReplyToId(replyToId === c.id ? null : c.id)
                    }
                    className="flex-shrink-0 text-xs font-medium text-rose-400 hover:text-rose-300"
                  >
                    Reply
                  </button>
                </div>

                {/* Nested replies to this thread */}
                {c.replies?.length > 0 && (
                  <div className="mt-3 space-y-2 border-l-2 border-white/15 pl-3">
                    {c.replies.map((r) => (
                      <div key={r.id} className="flex min-w-0 gap-2">
                        {r.authorImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.authorImage}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="app-img h-6 w-6 flex-shrink-0 rounded-full object-cover ring-1 ring-white/10"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200">
                            {r.author}
                          </p>
                          <p
                            className="pretty break-words text-xs text-slate-400"
                            dangerouslySetInnerHTML={{ __html: r.text || "" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply box for THIS thread */}
                {replyToId === c.id && (
                  <div className="mt-3 flex gap-2 pl-3">
                    <input
                      type="text"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={`Reply to ${c.author}…`}
                      className="field flex-1"
                    />
                    <button
                      onClick={() => sendReply(c.id)}
                      disabled={replying || !reply.trim()}
                      className="btn btn-primary"
                    >
                      {replying ? "…" : "Send"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
