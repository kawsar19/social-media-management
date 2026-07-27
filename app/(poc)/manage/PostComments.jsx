"use client";

import { useState } from "react";
import { FiMessageCircle } from "react-icons/fi";

// Comments panel for a single Page post: lists comments, lets the user reply,
// and delete individual comments. Lazily loads on first expand.
export default function PostComments({ fbToken, pageId, postId }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Per-comment nested reply: which comment's reply box is open + its text.
  const [replyToId, setReplyToId] = useState(null);
  const [nestedReply, setNestedReply] = useState("");
  const [nestedReplying, setNestedReplying] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    fetch(
      `/api/auth/facebook/comments?pageId=${encodeURIComponent(
        pageId
      )}&postId=${encodeURIComponent(postId)}`,
      { headers: { Authorization: `Bearer ${fbToken}` } }
    )
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

  async function sendReply() {
    if (!reply.trim()) return;
    setReplying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/facebook/comments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fbToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pageId, postId, message: reply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reply");
      } else {
        setReply("");
        load(); // refresh the list
      }
    } catch {
      setError("Network error while replying");
    } finally {
      setReplying(false);
    }
  }

  async function sendNestedReply(commentId) {
    if (!nestedReply.trim()) return;
    setNestedReplying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/facebook/comments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fbToken}`,
          "Content-Type": "application/json",
        },
        // commentId targets a specific comment -> Facebook nests the reply.
        body: JSON.stringify({ pageId, postId, commentId, message: nestedReply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reply");
      } else {
        setNestedReply("");
        setReplyToId(null);
        load(); // refresh so the new nested reply shows
      }
    } catch {
      setError("Network error while replying");
    } finally {
      setNestedReplying(false);
    }
  }

  async function deleteComment(commentId) {
    if (!window.confirm("Delete this comment?")) return;
    setDeletingId(commentId);
    setError(null);
    try {
      const res = await fetch(
        `/api/auth/facebook/comments?pageId=${encodeURIComponent(
          pageId
        )}&commentId=${encodeURIComponent(commentId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${fbToken}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to delete comment");
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch {
      setError("Network error while deleting");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <button
        onClick={toggle}
        className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
      >
        <FiMessageCircle className="h-4 w-4" /> {open ? "Hide comments" : "Comments"}
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-white/5 p-4">
          {error && (
            <p className="break-all rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
              {error}
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
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{c.from}</p>
                    <p className="break-words text-sm text-slate-300">
                      {c.message}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <button
                      onClick={() =>
                        setReplyToId(replyToId === c.id ? null : c.id)
                      }
                      className="text-xs font-medium text-slate-400 transition-colors hover:text-white"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => deleteComment(c.id)}
                      disabled={deletingId === c.id}
                      className="text-xs font-medium text-rose-300 hover:text-rose-200 hover:underline disabled:opacity-40"
                    >
                      {deletingId === c.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>

                {/* Nested replies to this comment */}
                {c.replies?.length > 0 && (
                  <div className="mt-2 space-y-2 border-l-2 border-white/15 pl-3">
                    {c.replies.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200">
                            {r.from}
                          </p>
                          <p className="break-words text-xs text-slate-400">
                            {r.message}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteComment(r.id)}
                          disabled={deletingId === r.id}
                          className="flex-shrink-0 text-xs font-medium text-rose-300 hover:text-rose-200 hover:underline disabled:opacity-40"
                        >
                          {deletingId === r.id ? "…" : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply box for THIS comment */}
                {replyToId === c.id && (
                  <div className="mt-2 flex gap-2 pl-3">
                    <input
                      type="text"
                      value={nestedReply}
                      onChange={(e) => setNestedReply(e.target.value)}
                      placeholder={`Reply to ${c.from}…`}
                      className="field flex-1"
                    />
                    <button
                      onClick={() => sendNestedReply(c.id)}
                      disabled={nestedReplying || !nestedReply.trim()}
                      className="btn btn-primary"
                    >
                      {nestedReplying ? "…" : "Send"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Top-level comment box */}
          <div className="flex gap-2">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply…"
              className="field flex-1"
            />
            <button
              onClick={sendReply}
              disabled={replying || !reply.trim()}
              className="btn btn-primary"
            >
              {replying ? "…" : "Reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
