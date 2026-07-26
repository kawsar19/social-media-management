"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PostComments from "./PostComments";
import { filterEnabledPages } from "../lib/enabledPages";

const FB_KEY = "facebook_user_access_token";

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

  useEffect(() => {
    setFbToken(localStorage.getItem(FB_KEY));
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Manage Page Posts</h1>
        <p className="mt-2 text-slate-500">
          View, filter, and delete recent posts from your Facebook Pages.
        </p>
      </div>

      {!connected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No Facebook account connected yet.
          </p>
          <Link
            href="/connect"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Go to Connect
          </Link>
        </div>
      )}

      {connected && (
        <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Choose a Page
          </label>
          <select
            value={selectedPageId}
            onChange={onSelectPage}
            className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 outline-none focus:border-slate-400"
          >
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
                className="flex-1 rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyWithPhoto}
                  onChange={(e) => setOnlyWithPhoto(e.target.checked)}
                  className="h-4 w-4"
                />
                Only with photo
              </label>
              <button
                onClick={() => loadPosts(selectedPageId)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                ↻ Refresh
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 break-all rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {selectedPageId && (
        <div className="space-y-4">
          {loadingPosts ? (
            <p className="text-sm text-slate-400">Loading posts…</p>
          ) : visiblePosts.length === 0 ? (
            <p className="text-sm text-slate-400">
              {posts.length === 0
                ? "No posts found for this Page."
                : "No posts match your filter."}
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Showing {visiblePosts.length} of {posts.length} posts
              </p>
              {visiblePosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-2xl border bg-white p-5 shadow-sm"
                >
                  <div className="flex gap-4">
                  {post.picture && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.picture}
                      alt=""
                      className="h-20 w-20 flex-shrink-0 rounded-lg border object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-900">
                      {post.message || post.story || (
                        <span className="italic text-slate-400">
                          (no text)
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>{formatDate(post.createdTime)}</span>
                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-slate-600"
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
                    className="h-fit rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
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
        <Link href="/connect" className="font-medium text-slate-900 underline">
          Connect
        </Link>{" "}
        or{" "}
        <Link href="/post" className="font-medium text-slate-900 underline">
          Create Post
        </Link>
        .
      </p>
    </div>
  );
}
