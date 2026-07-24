"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "linkedin_access_token";

export default function PostPage() {
  const [connected, setConnected] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    setConnected(Boolean(localStorage.getItem(STORAGE_KEY)));
  }, []);

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

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-400">{text.length} characters</span>
          <button
            disabled={!connected || text.trim().length === 0}
            className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Publish
          </button>
        </div>
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
