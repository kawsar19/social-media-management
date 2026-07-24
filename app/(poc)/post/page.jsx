"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "linkedin_access_token";

export default function PostPage() {
  const [token, setToken] = useState(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null); // File
  const [preview, setPreview] = useState(null); // object URL
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null); // { ok: boolean, message: string }

  const connected = Boolean(token);

  useEffect(() => {
    setToken(localStorage.getItem(STORAGE_KEY));
  }, []);

  function onPickImage(e) {
    const file = e.target.files?.[0] ?? null;
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function clearImage() {
    setImage(null);
    setPreview(null);
  }

  async function publish() {
    setPublishing(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("text", text);
      if (image) formData.append("image", image);

      const res = await fetch("/api/auth/linkedin/share", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error || "Failed to publish" });
      } else {
        setResult({
          ok: true,
          message: data.id ? `Published! (${data.id})` : "Published!",
        });
        setText("");
        clearImage();
      }
    } catch {
      setResult({ ok: false, message: "Network error while publishing" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Create Post</h1>
        <p className="mt-2 text-slate-500">
          Write a post and publish it to your connected accounts.
        </p>
      </div>

      {!connected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No LinkedIn account connected yet.
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
            💼
          </div>
          <div>
            <p className="font-medium text-slate-900">LinkedIn</p>
            <p className={connected ? "text-sm text-green-600" : "text-sm text-slate-400"}>
              {connected ? "Connected" : "Not connected"}
            </p>
          </div>
        </div>

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
          <span className="text-sm text-slate-400">{text.length} characters</span>
          <button
            onClick={publish}
            disabled={!connected || text.trim().length === 0 || publishing}
            className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>

        {result && (
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
