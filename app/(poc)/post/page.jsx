"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaLinkedin,
  FaFacebook,
  FaYoutube,
  FaInstagram,
  FaThreads,
} from "react-icons/fa6";
import { FiImage, FiVideo, FiLink } from "react-icons/fi";
import { filterEnabledPages } from "../lib/enabledPages";

const LINKEDIN_KEY = "linkedin_access_token";
const FB_KEY = "facebook_user_access_token";
const YT_KEY = "youtube_access_token";
const TH_KEY = "threads_access_token";
const TH_USER_ID_KEY = "threads_user_id";

export default function PostPage() {
  const [platform, setPlatform] = useState("linkedin"); // "linkedin" | "facebook" | "instagram" | "youtube"

  const [liToken, setLiToken] = useState(null);
  const [fbToken, setFbToken] = useState(null);
  const [ytToken, setYtToken] = useState(null);
  const [thToken, setThToken] = useState(null);
  const [thUserId, setThUserId] = useState(null);

  // Threads: like Instagram, media is provided as a public URL (the API fetches
  // it), but text-only posts are also valid. The Threads user id is saved at
  // connect time and needed to publish as this account.
  const [thImageUrl, setThImageUrl] = useState("");
  const [thVideoUrl, setThVideoUrl] = useState("");

  // Instagram rides on the Facebook token (no standalone login). Pick which
  // linked IG Business account to publish to, and provide the media as a public
  // URL — Instagram's API fetches media from a URL, it can't accept raw bytes.
  const [igAccounts, setIgAccounts] = useState([]);
  const [igLoading, setIgLoading] = useState(false);
  const [selectedIgId, setSelectedIgId] = useState("");
  const [igImageUrl, setIgImageUrl] = useState("");
  const [igVideoUrl, setIgVideoUrl] = useState("");

  // YouTube upload form (separate from the text/image post fields above).
  const [video, setVideo] = useState(null); // File
  const [ytTitle, setYtTitle] = useState("");
  const [ytDescription, setYtDescription] = useState("");
  const [ytPrivacy, setYtPrivacy] = useState("private");
  // Upload progress: null = idle; 0–100 = bytes sent to our server;
  // "finalizing" = bytes done, server is still pushing to YouTube.
  const [ytProgress, setYtProgress] = useState(null);

  const [text, setText] = useState("");
  const [image, setImage] = useState(null); // File
  const [preview, setPreview] = useState(null); // object URL

  // Facebook / LinkedIn: optional video to post (separate from the image above).
  const [fbVideo, setFbVideo] = useState(null); // File
  const [liVideo, setLiVideo] = useState(null); // File

  // Facebook Pages + which ones are selected to post to.
  const [fbPages, setFbPages] = useState([]);
  const [fbPagesLoading, setFbPagesLoading] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState([]);

  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null); // { ok, message } | { multi: [...] }

  const liConnected = Boolean(liToken);
  const fbConnected = Boolean(fbToken);
  const ytConnected = Boolean(ytToken);
  // Instagram is "connected" once Facebook is (it rides on that token) AND at
  // least one linked IG Business account was found.
  const igConnected = Boolean(fbToken) && igAccounts.length > 0;
  // Threads is connected once we have its token. The user id is optional — the
  // share route falls back to `/me` (the token identifies the account).
  const thConnected = Boolean(thToken);
  const connected =
    platform === "linkedin"
      ? liConnected
      : platform === "facebook"
      ? fbConnected
      : platform === "instagram"
      ? igConnected
      : platform === "threads"
      ? thConnected
      : ytConnected;

  useEffect(() => {
    setLiToken(localStorage.getItem(LINKEDIN_KEY));
    setFbToken(localStorage.getItem(FB_KEY));
    setYtToken(localStorage.getItem(YT_KEY));
    setThToken(localStorage.getItem(TH_KEY));
    setThUserId(localStorage.getItem(TH_USER_ID_KEY));
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
        if (res.ok) setFbPages(filterEnabledPages(data.pages || []));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFbPagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [platform, fbToken]);

  // When Instagram is selected and Facebook is connected, load which Pages have
  // a linked IG Business account (same token as Pages). Auto-select the first.
  useEffect(() => {
    if (platform !== "instagram" || !fbToken) return;

    let cancelled = false;
    setIgLoading(true);
    fetch("/api/auth/instagram/accounts", {
      headers: { Authorization: `Bearer ${fbToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          const accounts = data.accounts || [];
          setIgAccounts(accounts);
          setSelectedIgId((prev) => prev || accounts[0]?.id || "");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIgLoading(false);
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

  function onPickFbVideo(e) {
    const file = e.target.files?.[0] ?? null;
    setFbVideo(file);
    // A video and an image can't share one post — picking a video drops the image.
    if (file) clearImage();
  }

  function clearFbVideo() {
    setFbVideo(null);
  }

  function onPickLiVideo(e) {
    const file = e.target.files?.[0] ?? null;
    setLiVideo(file);
    // A video and an image can't share one post — picking a video drops the image.
    if (file) clearImage();
  }

  function clearLiVideo() {
    setLiVideo(null);
  }

  function togglePage(id) {
    setSelectedPageIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function onPickVideo(e) {
    const file = e.target.files?.[0] ?? null;
    setVideo(file);
    // Prefill the title from the filename (minus extension) if empty.
    if (file && !ytTitle.trim()) {
      setYtTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  }

  function clearVideo() {
    setVideo(null);
  }

  async function publishLinkedIn() {
    const formData = new FormData();
    formData.append("text", text);
    // A video takes precedence over an image (a post carries one or the other).
    if (liVideo) formData.append("video", liVideo);
    else if (image) formData.append("image", image);

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
      clearLiVideo();
    }
  }

  async function publishFacebook() {
    const formData = new FormData();
    formData.append("text", text);
    // A video takes precedence over an image (the API rejects both together).
    if (fbVideo) formData.append("video", fbVideo);
    else if (image) formData.append("image", image);
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
      clearFbVideo();
      setSelectedPageIds([]);
    }
  }

  async function publishInstagram() {
    // Instagram fetches media from a public URL, so we send a URL (not bytes).
    // A video takes precedence over an image (a post is one or the other).
    const payload = {
      igUserId: selectedIgId,
      caption: text,
    };
    if (igVideoUrl.trim()) payload.videoUrl = igVideoUrl.trim();
    else if (igImageUrl.trim()) payload.imageUrl = igImageUrl.trim();

    const res = await fetch("/api/auth/instagram/share", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fbToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setResult({ ok: false, message: data.error || "Failed to publish" });
    } else {
      setResult({
        ok: true,
        message: data.id ? `Published to Instagram! (${data.id})` : "Published!",
      });
      setText("");
      setIgImageUrl("");
      setIgVideoUrl("");
    }
  }

  async function publishThreads() {
    // Threads fetches media from a public URL (like Instagram), but text-only
    // posts are valid too. A video URL takes precedence over an image URL.
    const payload = {
      userId: thUserId,
      text,
    };
    if (thVideoUrl.trim()) payload.videoUrl = thVideoUrl.trim();
    else if (thImageUrl.trim()) payload.imageUrl = thImageUrl.trim();

    const res = await fetch("/api/auth/threads/share", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${thToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setResult({ ok: false, message: data.error || "Failed to publish" });
    } else {
      setResult({
        ok: true,
        message: data.id ? `Published to Threads! (${data.id})` : "Published!",
      });
      setText("");
      setThImageUrl("");
      setThVideoUrl("");
    }
  }

  function publishYouTube() {
    // XMLHttpRequest (not fetch) because only XHR exposes upload progress
    // events. This tracks browser -> our server; once that hits 100% the server
    // is still pushing the bytes to YouTube, shown as a "finalizing" state.
    const formData = new FormData();
    formData.append("video", video);
    formData.append("title", ytTitle);
    formData.append("description", ytDescription);
    formData.append("privacy", ytPrivacy);

    setYtProgress(0);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/auth/youtube/share");
      xhr.setRequestHeader("Authorization", `Bearer ${ytToken}`);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        // At 100% the browser is done sending; the server -> YouTube leg is
        // still in flight, so flip to "finalizing" instead of sitting at 100.
        setYtProgress(pct >= 100 ? "finalizing" : pct);
      };

      // Bytes fully sent to our server; waiting on the response now.
      xhr.upload.onload = () => setYtProgress("finalizing");

      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // leave data empty
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          setResult({
            ok: false,
            message: data.error || "Failed to upload video",
          });
        } else {
          setResult({
            ok: true,
            message: `Uploaded to YouTube! (${data.id}) — privacy: ${data.privacyStatus}`,
          });
          clearVideo();
          setYtTitle("");
          setYtDescription("");
        }
        resolve();
      };

      xhr.onerror = () => {
        setResult({ ok: false, message: "Network error while uploading" });
        resolve();
      };

      xhr.send(formData);
    });
  }

  async function publish() {
    setPublishing(true);
    setResult(null);
    try {
      if (platform === "linkedin") {
        await publishLinkedIn();
      } else if (platform === "facebook") {
        await publishFacebook();
      } else if (platform === "instagram") {
        await publishInstagram();
      } else if (platform === "threads") {
        await publishThreads();
      } else {
        await publishYouTube();
      }
    } catch {
      setResult({ ok: false, message: "Network error while publishing" });
    } finally {
      setPublishing(false);
      setYtProgress(null);
    }
  }

  const fbNoPageSelected =
    platform === "facebook" && selectedPageIds.length === 0;

  const isYouTube = platform === "youtube";
  const isInstagram = platform === "instagram";
  const isThreads = platform === "threads";
  // YouTube needs a video file + title; the other platforms need post text —
  // except Facebook, where a video alone (no text) is a valid post.
  const youtubeReady = Boolean(video) && ytTitle.trim().length > 0;
  // Instagram requires media (a public URL) and a chosen account; caption is
  // optional. Text-only isn't a valid IG post.
  const instagramReady =
    Boolean(selectedIgId) &&
    (igImageUrl.trim().length > 0 || igVideoUrl.trim().length > 0);
  // Threads accepts text-only OR media (a public URL) — one of them is enough.
  const threadsReady =
    text.trim().length > 0 ||
    thImageUrl.trim().length > 0 ||
    thVideoUrl.trim().length > 0;
  const hasPostBody =
    text.trim().length > 0 ||
    (platform === "facebook" && Boolean(fbVideo)) ||
    (platform === "linkedin" && Boolean(liVideo));

  // Facebook and LinkedIn both support one optional video; YouTube and
  // Instagram have their own dedicated forms. Resolve the active platform's
  // video + its handlers so the shared picker below works for either.
  const supportsVideo = platform === "facebook" || platform === "linkedin";
  const activeVideo = platform === "facebook" ? fbVideo : liVideo;
  const onPickActiveVideo =
    platform === "facebook" ? onPickFbVideo : onPickLiVideo;
  const clearActiveVideo =
    platform === "facebook" ? clearFbVideo : clearLiVideo;
  const canPublish =
    connected &&
    !publishing &&
    (isYouTube
      ? youtubeReady
      : isInstagram
      ? instagramReady
      : isThreads
      ? threadsReady
      : hasPostBody && !fbNoPageSelected);

  const platformLabel =
    platform === "linkedin"
      ? "LinkedIn"
      : platform === "facebook"
      ? "Facebook"
      : platform === "instagram"
      ? "Instagram"
      : platform === "threads"
      ? "Threads"
      : "YouTube";

  const accentText =
    platform === "linkedin"
      ? "text-sky-400"
      : platform === "facebook"
      ? "text-indigo-400"
      : platform === "instagram"
      ? "text-pink-400"
      : platform === "threads"
      ? "text-slate-100"
      : "text-rose-400";

  return (
    <div className="rise-in mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="balance text-4xl font-bold tracking-tight text-white">
          Create Post
        </h1>
        <p className="pretty mt-3 text-slate-400">
          Write a post — or upload a YouTube video — to your connected accounts.
        </p>
      </div>

      {/* Platform selector — segmented control on a glass pill */}
      <div className="mb-6 inline-flex gap-1 rounded-full glass p-1">
        <button
          onClick={() => setPlatform("linkedin")}
          className={
            "rounded-full px-5 py-2 text-sm font-semibold transition-colors " +
            (platform === "linkedin"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-400 hover:text-slate-200")
          }
        >
          <span className="inline-flex items-center gap-2">
            <FaLinkedin className="h-4 w-4" /> LinkedIn
          </span>
        </button>
        <button
          onClick={() => setPlatform("facebook")}
          className={
            "rounded-full px-5 py-2 text-sm font-semibold transition-colors " +
            (platform === "facebook"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-400 hover:text-slate-200")
          }
        >
          <span className="inline-flex items-center gap-2">
            <FaFacebook className="h-4 w-4" /> Facebook
          </span>
        </button>
        <button
          onClick={() => setPlatform("instagram")}
          className={
            "rounded-full px-5 py-2 text-sm font-semibold transition-colors " +
            (platform === "instagram"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-400 hover:text-slate-200")
          }
        >
          <span className="inline-flex items-center gap-2">
            <FaInstagram className="h-4 w-4" /> Instagram
          </span>
        </button>
        <button
          onClick={() => setPlatform("threads")}
          className={
            "rounded-full px-5 py-2 text-sm font-semibold transition-colors " +
            (platform === "threads"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-400 hover:text-slate-200")
          }
        >
          <span className="inline-flex items-center gap-2">
            <FaThreads className="h-4 w-4" /> Threads
          </span>
        </button>
        <button
          onClick={() => setPlatform("youtube")}
          className={
            "rounded-full px-5 py-2 text-sm font-semibold transition-colors " +
            (platform === "youtube"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-400 hover:text-slate-200")
          }
        >
          <span className="inline-flex items-center gap-2">
            <FaYoutube className="h-4 w-4" /> YouTube
          </span>
        </button>
      </div>

      {!connected && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">
          <p className="pretty text-sm text-yellow-900">
            No {platformLabel} account connected yet.
          </p>
          <Link href="/connect" className="btn btn-primary">
            Go to Connect
          </Link>
        </div>
      )}

      <div className="glass rounded-2xl p-6">
        <div className="mb-5 flex items-center gap-3 border-b border-white/10 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl">
            {platform === "linkedin" ? (
              <FaLinkedin className="h-5 w-5" />
            ) : platform === "facebook" ? (
              <FaFacebook className="h-5 w-5" />
            ) : platform === "instagram" ? (
              <FaInstagram className="h-5 w-5" />
            ) : platform === "threads" ? (
              <FaThreads className="h-5 w-5" />
            ) : (
              <FaYoutube className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className={"font-semibold " + accentText}>{platformLabel}</p>
            <p
              className={
                connected
                  ? "text-sm text-emerald-300"
                  : "text-sm text-slate-500"
              }
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: "currentColor" }} />
              {connected ? "Connected" : "Not connected"}
            </p>
          </div>
        </div>

        {/* Facebook: pick which Pages to post to */}
        {platform === "facebook" && fbConnected && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Post to which Pages?
            </p>
            {fbPagesLoading && fbPages.length === 0 ? (
              <p className="text-sm text-slate-500">Loading Pages…</p>
            ) : fbPages.length === 0 ? (
              <p className="text-sm text-slate-500">No Pages found.</p>
            ) : (
              <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                {fbPages.map((page) => (
                  <label
                    key={page.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2.5 transition-colors hover:border-indigo-400/40 hover:bg-indigo-400/10"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPageIds.includes(page.id)}
                      onChange={() => togglePage(page.id)}
                      className="h-4 w-4 accent-indigo-400"
                    />
                    <span className="truncate text-sm text-slate-300">
                      {page.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {selectedPageIds.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                <span className="tabular">{selectedPageIds.length}</span> Page
                {selectedPageIds.length > 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        )}

        {/* Instagram: pick account + caption + public media URL */}
        {isInstagram && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-pink-400">
                Post to which account?
              </p>
              {igLoading && igAccounts.length === 0 ? (
                <p className="text-sm text-slate-500">Loading accounts…</p>
              ) : igAccounts.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No Instagram Business account is linked to your Facebook Pages.
                </p>
              ) : (
                <select
                  value={selectedIgId}
                  onChange={(e) => setSelectedIgId(e.target.value)}
                  className="field w-full text-sm"
                >
                  {igAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.username ? `@${acc.username}` : acc.name || acc.id}
                      {acc.pageName ? ` — ${acc.pageName}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Write a caption… (optional)"
              className="field w-full resize-none"
            />

            {/* Instagram's API fetches media from a public URL — it can't accept
                an uploaded file directly, so we take a URL instead. A video URL
                takes precedence over an image URL (a post is one or the other). */}
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pink-400">
                <FiImage className="h-3.5 w-3.5" /> Image URL
              </label>
              <input
                type="url"
                value={igImageUrl}
                onChange={(e) => setIgImageUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                disabled={Boolean(igVideoUrl.trim())}
                className="field w-full text-sm disabled:opacity-40"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pink-400">
                <FiVideo className="h-3.5 w-3.5" /> Video URL (Reel)
              </label>
              <input
                type="url"
                value={igVideoUrl}
                onChange={(e) => setIgVideoUrl(e.target.value)}
                placeholder="https://example.com/reel.mp4"
                disabled={Boolean(igImageUrl.trim())}
                className="field w-full text-sm disabled:opacity-40"
              />
            </div>

            <p className="pretty inline-flex items-start gap-2 rounded-xl border border-pink-400/20 bg-pink-400/5 p-3 text-xs text-slate-400">
              <FiLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-400" />
              The media must be a public <strong>https</strong> URL — Instagram
              downloads it from its own servers, so a local file or localhost URL
              won&apos;t work. A video is published as a Reel.
            </p>
          </div>
        )}

        {/* Threads: caption + optional public media URL. Text-only is valid. */}
        {isThreads && (
          <div className="space-y-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="What's new? (up to 500 characters)"
              maxLength={500}
              className="field w-full resize-none"
            />

            {/* Threads fetches media from a public URL — it can't accept an
                uploaded file directly. A video URL takes precedence over an
                image URL (a post carries one or the other). */}
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <FiImage className="h-3.5 w-3.5" /> Image URL (optional)
              </label>
              <input
                type="url"
                value={thImageUrl}
                onChange={(e) => setThImageUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                disabled={Boolean(thVideoUrl.trim())}
                className="field w-full text-sm disabled:opacity-40"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <FiVideo className="h-3.5 w-3.5" /> Video URL (optional)
              </label>
              <input
                type="url"
                value={thVideoUrl}
                onChange={(e) => setThVideoUrl(e.target.value)}
                placeholder="https://example.com/clip.mp4"
                disabled={Boolean(thImageUrl.trim())}
                className="field w-full text-sm disabled:opacity-40"
              />
            </div>

            <p className="pretty inline-flex items-start gap-2 rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-slate-400">
              <FiLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
              A post can be text-only, or include one public <strong>https</strong>{" "}
              image/video URL — Threads downloads media from its own servers, so a
              local file or localhost URL won&apos;t work.
            </p>
          </div>
        )}

        {/* LinkedIn / Facebook: text + optional image */}
        {!isYouTube && !isInstagram && !isThreads && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="What do you want to share?"
              className="field w-full resize-none"
            />

            <div className="mt-4 flex flex-wrap items-start gap-3">
              {/* Image picker — hidden once a video is chosen, since a post can
                  carry a video or an image, not both. */}
              {!activeVideo &&
                (preview ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Selected"
                      className="app-img max-h-56 rounded-xl border border-white/10 object-cover"
                    />
                    <button
                      onClick={clearImage}
                      className="absolute right-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10">
                    <FiImage className="h-4 w-4" /> Add image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={onPickImage}
                      className="hidden"
                    />
                  </label>
                ))}

              {/* Facebook / LinkedIn: optional video. */}
              {supportsVideo &&
                !image &&
                (activeVideo ? (
                  <div className="flex items-center gap-3 rounded-xl border border-indigo-400/30 bg-indigo-400/10 p-3">
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-2 truncate text-sm font-medium text-white">
                        <FiVideo className="h-4 w-4" /> {activeVideo.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        <span className="tabular">
                          {(activeVideo.size / (1024 * 1024)).toFixed(1)}
                        </span>{" "}
                        MB
                      </p>
                    </div>
                    <button onClick={clearActiveVideo} className="btn btn-danger">
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-indigo-400/40 hover:bg-indigo-400/10">
                    <FiVideo className="h-4 w-4" /> Add video
                    <input
                      type="file"
                      accept="video/*"
                      onChange={onPickActiveVideo}
                      className="hidden"
                    />
                  </label>
                ))}
            </div>
          </>
        )}

        {/* YouTube: video file + title / description / privacy */}
        {isYouTube && (
          <div className="space-y-4">
            <div>
              {video ? (
                <div className="flex items-center justify-between rounded-xl border border-rose-400/30 bg-rose-400/10 p-4">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-2 truncate text-sm font-medium text-white">
                      <FiVideo className="h-4 w-4" /> {video.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      <span className="tabular">
                        {(video.size / (1024 * 1024)).toFixed(1)}
                      </span>{" "}
                      MB
                    </p>
                  </div>
                  <button onClick={clearVideo} className="btn btn-danger">
                    Remove
                  </button>
                </div>
              ) : (
                <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-white/5 p-12 text-center transition-colors hover:border-rose-400/50 hover:bg-rose-400/10">
                  <span className="transition-transform group-hover:scale-110">
                    <FiVideo className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-semibold text-slate-200">
                    Choose a video file
                  </span>
                  <span className="pretty text-xs text-slate-500">
                    Drag or click to select a video to upload
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={onPickVideo}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <input
              type="text"
              value={ytTitle}
              onChange={(e) => setYtTitle(e.target.value)}
              placeholder="Title"
              maxLength={100}
              className="field w-full"
            />

            <textarea
              value={ytDescription}
              onChange={(e) => setYtDescription(e.target.value)}
              rows={4}
              placeholder="Description (optional)"
              className="field w-full resize-none"
            />

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-rose-400">
                Privacy
              </label>
              <select
                value={ytPrivacy}
                onChange={(e) => setYtPrivacy(e.target.value)}
                className="field w-full text-sm"
              >
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </div>

            <p className="pretty rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-700">
              Note: if this Google app is not yet verified, uploaded videos are
              forced to <strong>private-locked</strong> by YouTube regardless of
              the privacy chosen here, until the app passes verification.
            </p>

            {/* Upload progress: numeric % while sending to our server, then an
                indeterminate "finalizing" state while the server pushes to
                YouTube. */}
            {ytProgress !== null && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {ytProgress === "finalizing"
                      ? "Finalizing on YouTube…"
                      : "Uploading…"}
                  </span>
                  {ytProgress !== "finalizing" && (
                    <span className="tabular font-medium text-rose-300">
                      {ytProgress}%
                    </span>
                  )}
                </div>
                <div className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-white/5">
                  <div
                    className={
                      ytProgress === "finalizing"
                        ? "h-full w-full animate-pulse rounded-full bg-gradient-to-r from-rose-500 to-orange-400"
                        : "h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-all"
                    }
                    style={
                      ytProgress === "finalizing"
                        ? undefined
                        : { width: `${ytProgress}%` }
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-5">
          <span className="text-sm text-slate-500">
            {isYouTube ? (
              video ? (
                "Ready to upload"
              ) : (
                "Select a video to upload"
              )
            ) : isInstagram ? (
              instagramReady ? (
                "Ready to publish"
              ) : (
                "Add a public image or video URL"
              )
            ) : (
              <>
                <span className="tabular">{text.length}</span> characters
              </>
            )}
          </span>
          <button
            onClick={publish}
            disabled={!canPublish}
            className="btn btn-primary"
          >
            {publishing
              ? isYouTube
                ? ytProgress === "finalizing"
                  ? "Finalizing…"
                  : typeof ytProgress === "number"
                  ? `Uploading ${ytProgress}%`
                  : "Uploading…"
                : "Publishing…"
              : isYouTube
              ? "Upload"
              : "Publish"}
          </button>
        </div>

        {fbNoPageSelected && fbConnected && (
          <p className="mt-3 text-sm text-amber-300">
            Select at least one Page to publish.
          </p>
        )}

        {/* Single-result (LinkedIn or error) */}
        {result && !result.multi && (
          <div
            className={
              result.ok
                ? "mt-4 break-all rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-300"
                : "mt-4 break-all rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
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
                    ? "break-all rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-300"
                    : "break-all rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
                }
              >
                <span className="font-semibold">{r.pageName}:</span>{" "}
                {r.ok ? `Published! (${r.id})` : r.error}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="pretty mt-6 text-sm text-slate-500">
        Manage your accounts on the{" "}
        <Link href="/connect" className="font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white">
          Connect
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
