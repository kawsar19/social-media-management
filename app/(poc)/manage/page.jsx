"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PostComments from "./PostComments";
import { filterEnabledPages } from "../lib/enabledPages";
import { getPlatformToken } from "../lib/socialTokens";
import { FiRefreshCw } from "react-icons/fi";

export default function ManagePage() {
  const [fbToken, setFbToken] = useState(null);

  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");

  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState(null);

  const [query, setQuery] = useState(""); // text filter
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const connected = Boolean(fbToken);

  // Facebook token from the DB instead of localStorage.
  useEffect(() => {
    let cancelled = false;
    getPlatformToken("facebook").then((t) => {
      if (!cancelled) setFbToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the Pages the user manages.
  useEffect(() => {
    if (!fbToken) return;
    let cancelled = false;
    fetch("/api/auth/facebook/pages", {
      headers: { Authorization: `Bearer ${fbToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setPages(filterEnabledPages(data.pages || []));
        else setError(data.error || "Failed to load Pages");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load Pages");
      });
    return () => {
      cancelled = true;
    };
  }, [fbToken]);

  function loadPosts(pageId) {
    if (!pageId) return;
    setLoadingPosts(true);
    setError(null);
    setPosts([]);
    fetch(
      `/api/auth/facebook/posts?pageId=${encodeURIComponent(pageId)}&limit=25`,
      { headers: { Authorization: `Bearer ${fbToken}` } }
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load posts");
          setPosts([]);
        } else {
          setPosts(data.posts || []);
        }
      })
      .catch(() => setError("Failed to load posts"))
      .finally(() => setLoadingPosts(false));
  }

  function onSelectPage(e) {
    const id = e.target.value;
    setSelectedPageId(id);
    loadPosts(id);
  }

  async function deletePost(postId) {
    if (!window.confirm("Delete this post permanently? This cannot be undone."))
      return;
    setDeletingId(postId);
    setError(null);
    try {
      const res = await fetch(
        `/api/auth/facebook/posts?pageId=${encodeURIComponent(
          selectedPageId
        )}&postId=${encodeURIComponent(postId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${fbToken}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to delete post");
      } else {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      }
    } catch {
      setError("Network error while deleting");
    } finally {
      setDeletingId(null);
    }
  }

  // Apply the client-side filters.
  const visiblePosts = posts.filter((p) => {
    if (onlyWithPhoto && !p.picture) return false;
    if (query.trim()) {
      const text = `${p.message || ""} ${p.story || ""}`.toLowerCase();
      if (!text.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString();
  }

  return (
    <div className="rise-in mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="balance text-3xl font-bold text-white">
          Manage Page Posts
        </h1>
        <p className="pretty mt-2 text-slate-400">
          View, filter, and delete recent posts from your Facebook Pages.
        </p>
      </div>

      {!connected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">
          <p className="text-sm">No Facebook account connected yet.</p>
          <Link href="/connect" className="btn btn-primary">
            Go to Connect
          </Link>
        </div>
      )}

      {connected && (
        <div className="glass mb-6 rounded-2xl p-6">
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Choose a Page
          </label>
          <select value={selectedPageId} onChange={onSelectPage} className="field w-full">
            <option value="">— Select a Page —</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {selectedPageId && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter posts by text…"
                className="field flex-1"
              />
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={onlyWithPhoto}
                  onChange={(e) => setOnlyWithPhoto(e.target.checked)}
                  className="h-4 w-4 accent-indigo-500"
                />
                Only with photo
              </label>
              <button
                onClick={() => loadPosts(selectedPageId)}
                className="btn btn-ghost"
              >
                <FiRefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 break-all rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {selectedPageId && (
        <div className="stagger space-y-4">
          {loadingPosts ? (
            <p className="text-sm text-slate-500">Loading posts…</p>
          ) : visiblePosts.length === 0 ? (
            <p className="text-sm text-slate-500">
              {posts.length === 0
                ? "No posts found for this Page."
                : "No posts match your filter."}
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-400">
                Showing <span className="tabular">{visiblePosts.length}</span> of{" "}
                <span className="tabular">{posts.length}</span> posts
              </p>
              {visiblePosts.map((post, index) => (
                <div
                  key={post.id}
                  style={{ "--i": index }}
                  className="glass glass-hover rounded-2xl p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row">
                  {post.picture && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.picture}
                      alt=""
                      className="app-img h-20 w-20 flex-shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
                      {post.message || post.story || (
                        <span className="italic text-slate-500">
                          (no text)
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{formatDate(post.createdTime)}</span>
                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-200 underline hover:text-white"
                        >
                          View on Facebook
                        </a>
                      )}
                      <span className="truncate">ID: {post.id}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deletePost(post.id)}
                    disabled={deletingId === post.id}
                    className="btn btn-danger h-fit"
                  >
                    {deletingId === post.id ? "Deleting…" : "Delete"}
                  </button>
                  </div>

                  <PostComments
                    fbToken={fbToken}
                    pageId={selectedPageId}
                    postId={post.id}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <p className="mt-8 text-sm text-slate-500">
        Go back to{" "}
        <Link href="/connect" className="text-slate-200 underline hover:text-white">
          Connect
        </Link>{" "}
        or{" "}
        <Link href="/post" className="text-slate-200 underline hover:text-white">
          Create Post
        </Link>
        .
      </p>
    </div>
  );
}
