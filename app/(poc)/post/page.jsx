"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKEDIN_KEY = "linkedin_access_token";
const FB_KEY = "facebook_user_access_token";

export default function PostPage() {
  const [platform, setPlatform] = useState("linkedin"); // "linkedin" | "facebook"

  const [liToken, setLiToken] = useState(null);
  const [fbToken, setFbToken] = useState(null);

  const [text, setText] = useState("");
  const [image, setImage] = useState(null); // File
  const [preview, setPreview] = useState(null); // object URL

  // Facebook Pages + which ones are selected to post to.
  const [fbPages, setFbPages] = useState([]);
  const [fbPagesLoading, setFbPagesLoading] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState([]);

  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null); // { ok, message } | { multi: [...] }

  const liConnected = Boolean(liToken);
  const fbConnected = Boolean(fbToken);
  const connected = platform === "linkedin" ? liConnected : fbConnected;

  useEffect(() => {
    setLiToken(localStorage.getItem(LINKEDIN_KEY));
    setFbToken(localStorage.getItem(FB_KEY));
  }, []);

  // When Facebook is selected and connected, load the Pages to choose from.
  useEffect(() => {
    if (platform !== "facebook" || !fbToken) return;

    let cancelled = false;
    setFbPagesLoading(true);
    fetch("/api/auth/facebook/pages", {
      headers: { Authorization: `Bearer ${fbToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setFbPages(data.pages || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFbPagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [platform, fbToken]);

  function onPickImage(e) {
    const file = e.target.files?.[0] ?? null;
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function clearImage() {
    setImage(null);
    setPreview(null);
  }

  function togglePage(id) {
    setSelectedPageIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function publishLinkedIn() {
    const formData = new FormData();
    formData.append("text", text);
    if (image) formData.append("image", image);

    const res = await fetch("/api/auth/linkedin/share", {
      method: "POST",
      headers: { Authorization: `Bearer ${liToken}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      setResult({ ok: false, message: data.error || "Failed to publish" });
    } else {
      setResult({
        ok: true,
        message: data.id ? `Published to LinkedIn! (${data.id})` : "Published!",
      });
      setText("");
      clearImage();
    }
  }

  async function publishFacebook() {
    const formData = new FormData();
    formData.append("text", text);
    if (image) formData.append("image", image);
    formData.append("pageIds", JSON.stringify(selectedPageIds));

    const res = await fetch("/api/auth/facebook/share", {
      method: "POST",
      headers: { Authorization: `Bearer ${fbToken}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      setResult({ ok: false, message: data.error || "Failed to publish" });
      return;
    }

    const allOk = data.results.every((r) => r.ok);
    setResult({ multi: data.results });
    if (allOk) {
      setText("");
      clearImage();
      setSelectedPageIds([]);
    }
  }

  async function publish() {
    setPublishing(true);
    setResult(null);
    try {
      if (platform === "linkedin") {
        await publishLinkedIn();
      } else {
        await publishFacebook();
      }
    } catch {
      setResult({ ok: false, message: "Network error while publishing" });
    } finally {
      setPublishing(false);
    }
  }

  const fbNoPageSelected =
    platform === "facebook" && selectedPageIds.length === 0;
  const canPublish =
    connected && text.trim().length > 0 && !publishing && !fbNoPageSelected;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Create Post</h1>
        <p className="mt-2 text-slate-500">
          Write a post and publish it to your connected accounts.
        </p>
      </div>

      {/* Platform selector */}
      <div className="mb-6 inline-flex rounded-xl border bg-white p-1 shadow-sm">
        <button
          onClick={() => setPlatform("linkedin")}
          className={
            platform === "linkedin"
              ? "rounded-lg bg-black px-5 py-2 text-sm font-medium text-white"
              : "rounded-lg px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          }
        >
          💼 LinkedIn
        </button>
        <button
          onClick={() => setPlatform("facebook")}
          className={
            platform === "facebook"
              ? "rounded-lg bg-black px-5 py-2 text-sm font-medium text-white"
              : "rounded-lg px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          }
        >
          📘 Facebook
        </button>
      </div>

      {!connected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No {platform === "linkedin" ? "LinkedIn" : "Facebook"} account
            connected yet.
          </p>
          <Link
            href="/connect"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Go to Connect
          </Link>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl">
            {platform === "linkedin" ? "💼" : "📘"}
          </div>
          <div>
            <p className="font-medium text-slate-900">
              {platform === "linkedin" ? "LinkedIn" : "Facebook"}
            </p>
            <p
              className={
                connected ? "text-sm text-green-600" : "text-sm text-slate-400"
              }
            >
              {connected ? "Connected" : "Not connected"}
            </p>
          </div>
        </div>

        {/* Facebook: pick which Pages to post to */}
        {platform === "facebook" && fbConnected && (
          <div className="mb-4 rounded-xl border border-slate-200 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Post to which Pages?
            </p>
            {fbPagesLoading && fbPages.length === 0 ? (
              <p className="text-sm text-slate-400">Loading Pages…</p>
            ) : fbPages.length === 0 ? (
              <p className="text-sm text-slate-400">No Pages found.</p>
            ) : (
              <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                {fbPages.map((page) => (
                  <label
                    key={page.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPageIds.includes(page.id)}
                      onChange={() => togglePage(page.id)}
                      className="h-4 w-4"
                    />
                    <span className="truncate text-sm text-slate-700">
                      {page.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {selectedPageIds.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {selectedPageIds.length} Page
                {selectedPageIds.length > 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="What do you want to share?"
          className="w-full resize-none rounded-xl border border-slate-200 p-4 text-slate-900 outline-none focus:border-slate-400"
        />

        <div className="mt-4">
          {preview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Selected"
                className="max-h-56 rounded-xl border object-cover"
              />
              <button
                onClick={clearImage}
                className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white hover:bg-black"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              🖼️ Add image
              <input
                type="file"
                accept="image/*"
                onChange={onPickImage}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            {text.length} characters
          </span>
          <button
            onClick={publish}
            disabled={!canPublish}
            className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>

        {fbNoPageSelected && fbConnected && (
          <p className="mt-3 text-sm text-amber-600">
            Select at least one Page to publish.
          </p>
        )}

        {/* Single-result (LinkedIn or error) */}
        {result && !result.multi && (
          <div
            className={
              result.ok
                ? "mt-4 break-all rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700"
                : "mt-4 break-all rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            }
          >
            {result.message}
          </div>
        )}

        {/* Per-Page results (Facebook) */}
        {result?.multi && (
          <div className="mt-4 space-y-2">
            {result.multi.map((r) => (
              <div
                key={r.pageId}
                className={
                  r.ok
                    ? "break-all rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700"
                    : "break-all rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                }
              >
                <span className="font-medium">{r.pageName}:</span>{" "}
                {r.ok ? `Published! (${r.id})` : r.error}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Manage your accounts on the{" "}
        <Link href="/connect" className="font-medium text-slate-900 underline">
          Connect
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
