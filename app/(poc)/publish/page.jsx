"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaLinkedin,
  FaFacebook,
  FaYoutube,
  FaThreads,
  FaInstagram,
} from "react-icons/fa6";
import {
  FiImage,
  FiVideo,
  FiCheck,
  FiX,
  FiLoader,
  FiClock,
  FiZap,
  FiAlertTriangle,
  FiInfo,
  FiUsers,
  FiSend,
  FiUploadCloud,
  FiExternalLink,
  FiPlus,
} from "react-icons/fi";
import { filterEnabledPages } from "../lib/enabledPages";
import {
  PLATFORM_MEDIA_LIMITS,
  PIPELINE_MAX_BYTES,
  formatBytes,
  formatDuration,
  platformsOverLimit,
} from "../lib/mediaLimits";
import {
  fetchAccounts,
  getAccountsMap,
  getYouTubeToken,
  uploadMedia,
} from "../lib/socialTokens";
import { createPost, publishPostStream } from "../lib/posts";
import AiPostWriter from "../components/AiPostWriter";
import AiImageGenerator from "../components/AiImageGenerator";
import LinkedInFormatter from "../components/LinkedInFormatter";
import LinkedInPreview from "../components/LinkedInPreview";

// The target platforms, in the order they publish (sequential).
const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn", Icon: FaLinkedin, accent: "text-sky-400" },
  { id: "facebook", label: "Facebook", Icon: FaFacebook, accent: "text-indigo-400" },
  { id: "instagram", label: "Instagram", Icon: FaInstagram, accent: "text-pink-400" },
  { id: "threads", label: "Threads", Icon: FaThreads, accent: "text-slate-100" },
  { id: "youtube", label: "YouTube", Icon: FaYoutube, accent: "text-rose-400" },
];

// Per-target run states, used to drive the live progress UI.
const STATUS = {
  idle: "idle",
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

export default function PublishPage() {
  // Connection tokens (read from localStorage, same keys as the Post page).
  // Instagram rides on the Facebook token (no separate token of its own).
  const [tokens, setTokens] = useState({
    linkedin: null,
    facebook: null,
    youtube: null,
    threads: null,
  });

  // Per-platform identity ({ platformId, platformName }) from the DB, so we can
  // show WHERE each post is going (account name + id + a profile URL) instead of
  // just "Selected". Keyed by platform id.
  const [accountMeta, setAccountMeta] = useState({});

  // Instagram accounts linked to the Facebook token (loaded when FB connected).
  // IG publishing needs a chosen account id + a public media URL (below).
  const [igAccounts, setIgAccounts] = useState([]);
  const [selectedIgId, setSelectedIgId] = useState("");

  // Public https media URL — the only way Instagram (and Threads) can take
  // media, since they fetch it by URL rather than accepting an upload. This is
  // filled automatically: when the user picks/generates an image or picks a
  // video, we upload it to R2 and store the returned URL here. No manual paste
  // needed. resourceType ("image" | "video") comes from the upload so we route
  // the URL to the right IG/Threads field. Videos are staging only — the
  // publish route deletes them from R2 once every platform has fetched them;
  // images are kept so the saved post keeps its preview.
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaResourceType, setMediaResourceType] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Live upload progress: { loaded, total, percent }. Null when no upload is in
  // flight. A video takes long enough that a bare spinner leaves the user
  // unable to tell a slow upload from a stalled one.
  const [uploadProgress, setUploadProgress] = useState(null);

  // Which platforms the user wants to publish to.
  const [selected, setSelected] = useState({
    linkedin: true,
    facebook: true,
    instagram: true,
    youtube: true,
    threads: true,
  });

  // Shared post content.
  const [text, setText] = useState("");
  const [image, setImage] = useState(null); // File
  const [preview, setPreview] = useState(null); // object URL
  const [video, setVideo] = useState(null); // File

  // AI post writing — the brief and options live in the modal; the page only
  // tracks whether it's open and takes the accepted text back into `text`.
  const [writerOpen, setWriterOpen] = useState(false);

  // AI image generation — the prompt, shape, and style live in the modal; the
  // page only tracks whether it's open and takes the accepted image back as a
  // File, the same shape a picked file has.
  const [imageGenOpen, setImageGenOpen] = useState(false);

  // Facebook Pages to post to.
  const [fbPages, setFbPages] = useState([]);
  const [fbPagesLoading, setFbPagesLoading] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState([]);

  // YouTube-specific fields (only used when a video is attached).
  const [ytTitle, setYtTitle] = useState("");
  const [ytPrivacy, setYtPrivacy] = useState("private");

  // Connected YouTube channels ({ _id, platformId, platformName }) and which
  // ones to publish to. A user can connect several channels, so this mirrors
  // the Facebook Pages pattern: one target per checked channel.
  const [ytChannels, setYtChannels] = useState([]);
  const [selectedYtIds, setSelectedYtIds] = useState([]);

  // Per-destination publish progress, in the order the server publishes them.
  // Empty until a publish starts. An array rather than a map because Facebook
  // contributes one step per Page, so the platform alone isn't a unique key.
  const [steps, setSteps] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Load platform tokens from the DB. YouTube uses the refresh endpoint so an
  // expired token is renewed server-side; the Threads user id is its platformId.
  //
  // fetchAccounts() (the full list) is read alongside getAccountsMap() because
  // the map keeps only one account per platform — that's fine for the
  // single-account platforms but would hide all but one YouTube channel.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAccountsMap(),
      fetchAccounts(),
      getYouTubeToken().catch(() => null),
    ]).then(([map, accounts, ytToken]) => {
      if (cancelled) return;
      setTokens({
        linkedin: map.linkedin?.accessToken || null,
        facebook: map.facebook?.accessToken || null,
        youtube: ytToken || null,
        threads: map.threads?.accessToken || null,
      });
      // Keep each platform's { platformId, platformName } to show the post
      // destination in the UI. (Facebook lists Pages separately below.)
      setAccountMeta(map);

      const yt = accounts.filter((a) => a.platform === "youtube");
      setYtChannels(yt);
      // Default to every channel checked, matching the platform toggles which
      // all start on. The user unchecks what they don't want.
      setSelectedYtIds(yt.map((a) => a.platformId));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load Facebook Pages when connected + selected.
  useEffect(() => {
    if (!selected.facebook || !tokens.facebook) return;
    let cancelled = false;
    setFbPagesLoading(true);
    fetch("/api/auth/facebook/pages", {
      headers: { Authorization: `Bearer ${tokens.facebook}` },
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
  }, [selected.facebook, tokens.facebook]);

  // Load linked Instagram accounts when Instagram is selected + FB connected.
  // IG rides on the Facebook token; we auto-select the first account found.
  useEffect(() => {
    if (!selected.instagram || !tokens.facebook) return;
    let cancelled = false;
    fetch("/api/auth/instagram/accounts", {
      headers: { Authorization: `Bearer ${tokens.facebook}` },
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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected.instagram, tokens.facebook]);

  // Upload the picked/generated file to R2 and stash the public URL +
  // resource type. Instagram/Threads publish off mediaUrl, so this is what makes
  // a local file usable on those platforms without any manual URL paste.
  async function uploadForMedia(file) {
    setUploading(true);
    setUploadError("");
    // Start at zero rather than null so the bar appears immediately, before the
    // first progress event arrives.
    setUploadProgress({ loaded: 0, total: file.size, percent: 0 });
    try {
      const { url, resourceType } = await uploadMedia(file, setUploadProgress);
      setMediaUrl(url);
      setMediaResourceType(resourceType || null);
    } catch (err) {
      setMediaUrl("");
      setMediaResourceType(null);
      setUploadError(err?.message || "Failed to upload media");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  // Clear any uploaded media URL (e.g. when the file is removed/replaced).
  function clearMediaUrl() {
    setMediaUrl("");
    setMediaResourceType(null);
    setUploadError("");
    setUploadProgress(null);
  }

  function onPickImage(e) {
    const file = e.target.files?.[0] ?? null;
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
    if (file) {
      clearVideo();
      uploadForMedia(file);
    }
  }

  function clearImage() {
    setImage(null);
    setPreview(null);
    clearMediaUrl();
  }

  // Take an accepted image from the generator modal. It arrives as a File, so
  // from here on it's handled exactly like a picked file — same preview, same
  // R2 upload, same publish path.
  function onGeneratedImage(file) {
    clearVideo();
    setImage(file);
    setPreview(URL.createObjectURL(file));
    uploadForMedia(file);
  }

  function onPickVideo(e) {
    const file = e.target.files?.[0] ?? null;
    setVideo(file);
    if (file) {
      clearImage();
      if (!ytTitle.trim()) setYtTitle(file.name.replace(/\.[^.]+$/, ""));
      uploadForMedia(file);
    }
  }

  function clearVideo() {
    setVideo(null);
    clearMediaUrl();
  }

  function togglePlatform(id) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function togglePage(id) {
    setSelectedPageIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function toggleYtChannel(channelId) {
    setSelectedYtIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((c) => c !== channelId)
        : [...prev, channelId]
    );
  }

  const connected = {
    linkedin: Boolean(tokens.linkedin),
    facebook: Boolean(tokens.facebook),
    // Instagram rides on the Facebook token + needs a linked IG account.
    instagram: Boolean(tokens.facebook) && igAccounts.length > 0,
    // Any connected channel counts. The per-channel tokens are resolved
    // server-side at publish time, so tokens.youtube (which is only the first
    // channel's) isn't what decides this.
    youtube: ytChannels.length > 0,
    // User id is optional — the share route falls back to `/me`.
    threads: Boolean(tokens.threads),
  };

  // Where a post goes for a platform: the account name/username, its id, and a
  // best-effort profile URL. Used to show the destination under each platform so
  // it's clear which account/channel/page will receive the post.
  //  - Facebook lists Pages separately (multiple targets), so it's handled there.
  //  - Instagram's target is the chosen IG account (may differ from FB).
  function destinationFor(id) {
    if (id === "instagram") {
      const acc =
        igAccounts.find((a) => a.id === selectedIgId) || igAccounts[0];
      if (!acc) return null;
      const name = acc.username ? `@${acc.username}` : acc.name || acc.id;
      return {
        name,
        subId: acc.id,
        url: acc.username ? `https://instagram.com/${acc.username}` : null,
      };
    }
    if (id === "youtube") {
      // With one channel connected this is that channel; the multi-channel case
      // is shown by the checkbox list instead of a single destination line.
      const ch =
        ytChannels.find((c) => c.platformId === selectedYtIds[0]) || ytChannels[0];
      if (!ch) return null;
      return {
        name: ch.platformName || "YouTube Channel",
        subId: ch.platformId,
        url: ch.platformId ? `https://youtube.com/channel/${ch.platformId}` : null,
      };
    }
    const meta = accountMeta[id];
    if (!meta) return null;
    const name = meta.platformName || id;
    const pid = meta.platformId;
    let url = null;
    if (id === "youtube" && pid) url = `https://youtube.com/channel/${pid}`;
    // LinkedIn (member sub) and Threads (numeric user id) have no clean public
    // profile URL derivable from the id we store, so we show the id only.
    return { name, subId: pid, url };
  }

  const hasVideo = Boolean(video);
  const hasText = text.trim().length > 0;
  const hasMediaUrl = mediaUrl.trim().length > 0;
  // Prefer the uploader's resource type (authoritative); fall back to the URL
  // extension for any URL that didn't come through our uploader.
  const mediaUrlIsVideo =
    mediaResourceType === "video" ||
    (mediaResourceType == null &&
      /\.(mp4|mov|m4v|webm)(\?|$)/i.test(mediaUrl.trim()));

  // Which targets will actually run: selected + connected.
  //  - YouTube only runs when a video is present (no text-only mode).
  //  - Instagram can't take uploaded files (it fetches media by URL) and has
  //    no text-only mode, so it runs ONLY when a public media URL is given.
  //  - Threads takes text and/or the public media URL. With neither -> skipped.
  function plannedStatus(id) {
    if (!selected[id] || !connected[id]) return null; // not in the run at all
    if (id === "youtube" && !hasVideo) return STATUS.skipped;
    if (id === "instagram" && !hasMediaUrl) return STATUS.skipped;
    if (id === "threads" && !hasText && !hasMediaUrl) return STATUS.skipped;
    return STATUS.pending;
  }

  const activeTargets = PLATFORMS.filter((p) => plannedStatus(p.id) === STATUS.pending);

  // Media size checks against the limits in lib/mediaLimits. Two separate
  // problems, reported separately because the fixes differ:
  //  - oversizeTargets: platforms that would reject this file. The rest still
  //    publish, so this is a warning, not a block.
  //  - overPipelineLimit: our own publish path buffers the whole file in
  //    memory, so past this size nothing publishes at all.
  const mediaSize = video?.size || image?.size || 0;
  const oversizeTargets = platformsOverLimit(
    mediaSize,
    activeTargets.map((p) => p.id)
  );
  const overPipelineLimit = mediaSize > PIPELINE_MAX_BYTES;

  // Can we publish? At least one active target, some content, and (for FB) a Page.
  const hasContent =
    text.trim().length > 0 || hasVideo || Boolean(image) || hasMediaUrl;
  const fbNeedsPage =
    selected.facebook && connected.facebook && selectedPageIds.length === 0;
  const ytNeedsTitle =
    selected.youtube && connected.youtube && hasVideo && !ytTitle.trim();
  // Same shape as fbNeedsPage: YouTube is selected and would run, but every
  // channel is unchecked, so there'd be nowhere to publish it.
  const ytNeedsChannel =
    selected.youtube && connected.youtube && hasVideo && selectedYtIds.length === 0;
  const canPublish =
    !publishing &&
    !uploading &&
    activeTargets.length > 0 &&
    hasContent &&
    !fbNeedsPage &&
    !ytNeedsTitle &&
    !ytNeedsChannel;

  // Build the DB target list from the current selection. Facebook expands to one
  // target per selected Page (each a distinct destination); Instagram carries
  // the chosen IG account; the rest carry the account's own identity.
  function buildTargets() {
    const targets = [];
    for (const p of activeTargets) {
      if (p.id === "facebook") {
        for (const pageId of selectedPageIds) {
          const page = fbPages.find((fp) => fp.id === pageId);
          targets.push({
            platform: "facebook",
            accountName: accountMeta.facebook?.platformName,
            destinationId: pageId,
            destinationName: page?.name,
          });
        }
        continue;
      }
      if (p.id === "instagram") {
        const acc = igAccounts.find((a) => a.id === selectedIgId) || igAccounts[0];
        targets.push({
          platform: "instagram",
          destinationId: acc?.id,
          destinationName: acc?.username ? `@${acc.username}` : acc?.name,
        });
        continue;
      }
      if (p.id === "youtube") {
        // One target per checked channel. destinationId is the channel id,
        // which the publish route resolves to that channel's own token.
        for (const channelId of selectedYtIds) {
          const ch = ytChannels.find((c) => c.platformId === channelId);
          targets.push({
            platform: "youtube",
            accountName: ch?.platformName,
            destinationId: channelId,
            destinationName: ch?.platformName,
          });
        }
        continue;
      }
      const meta = accountMeta[p.id];
      targets.push({
        platform: p.id,
        accountName: meta?.platformName,
        destinationId: meta?.platformId,
      });
    }
    return targets;
  }

  // Assemble the post payload shared by "save draft" and "save & publish".
  function buildPostPayload(status) {
    const payload = {
      content: text,
      targets: buildTargets(),
      status,
    };
    if (mediaUrl.trim()) {
      payload.mediaUrl = mediaUrl.trim();
      payload.mediaType = mediaUrlIsVideo ? "video" : "image";
    }
    if (ytTitle.trim()) payload.youtubeTitle = ytTitle.trim();
    if (ytPrivacy) payload.youtubePrivacy = ytPrivacy;
    return payload;
  }

  async function onSaveDraft() {
    if (saving) return;
    setSaving(true);
    setSaveMsg("");
    try {
      await createPost(buildPostPayload("draft"));
      setSaveMsg("Saved to your posts.");
    } catch (e) {
      setSaveMsg(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Save the post to the DB, then publish it server-side so every destination's
  // result is recorded on the post. Mirrors the live per-platform UI from the
  // saved post's targets after it returns.
  async function onSaveAndPublish() {
    if (saving || !canPublish) return;
    setSaving(true);
    setSaveMsg("");
    setPublishing(true);
    try {
      const created = await createPost(buildPostPayload("draft"));
      await publishPostStream(created._id, (event) => {
        // `start` names every destination up front, so the stepper shows the
        // whole run (including the ones still queued) from the first frame.
        if (event.type === "start") {
          setSteps(
            event.targets.map((t) => ({
              key: t.key,
              platform: t.platform,
              destinationName: t.destinationName,
              status: STATUS.pending,
              message: "Waiting…",
            }))
          );
          return;
        }
        if (event.type === "target") {
          setSteps((prev) =>
            prev.map((s) =>
              s.key !== event.key
                ? s
                : {
                    ...s,
                    status:
                      event.status === "success"
                        ? STATUS.done
                        : event.status === "failed"
                        ? STATUS.failed
                        : STATUS.running,
                    message:
                      event.status === "running"
                        ? "Publishing…"
                        : event.status === "success"
                        ? event.platformPostId
                          ? `Published (${event.platformPostId})`
                          : "Published"
                        : event.error || "Failed",
                    permalink: event.permalink,
                  }
            )
          );
        }
      });
      setSaveMsg("Saved and published — see your posts for details.");
    } catch (e) {
      setSaveMsg(e?.message || "Failed to publish");
      // The stream died mid-run; anything still pending has an unknown outcome
      // rather than a successful one.
      setSteps((prev) =>
        prev.map((s) =>
          s.status === STATUS.pending || s.status === STATUS.running
            ? { ...s, status: STATUS.failed, message: "Interrupted" }
            : s
        )
      );
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  }

  function reset() {
    setSteps([]);
    setSaveMsg("");
    setText("");
    clearImage();
    clearVideo();
    clearMediaUrl();
    setYtTitle("");
  }

  const anyConnected =
    connected.linkedin ||
    connected.facebook ||
    connected.instagram ||
    connected.youtube ||
    connected.threads;
  const allDone =
    steps.length > 0 &&
    steps.every((s) => s.status !== STATUS.running && s.status !== STATUS.pending);
  const doneCount = steps.filter((s) => s.status === STATUS.done).length;

  // Step completion, used to fill in the numbered markers so the page shows
  // how far along the post is instead of looking uniformly inert.
  const step1Done = activeTargets.length > 0 && !fbNeedsPage && !ytNeedsChannel;
  const step2Done = hasContent;

  return (
    <div className="rise-in mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Page header */}
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="ai-chip">
            <FiZap className="h-3.5 w-3.5" /> Composer
          </span>
          <h1 className="balance mt-2.5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Publish Everywhere
          </h1>
          <p className="pretty mt-2 max-w-xl text-sm text-slate-400">
            Write once, publish to all your connected accounts — one after
            another, with live progress.
          </p>
        </div>
        {anyConnected && (
          <span className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="tabular">
              {Object.values(connected).filter(Boolean).length}
            </span>{" "}
            connected
          </span>
        )}
      </div>

      {!anyConnected && (
        <div className="pc-note pc-note-warn mb-6 items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <FiAlertTriangle className="h-4 w-4 shrink-0" />
            No accounts connected yet.
          </span>
          <Link href="/connect" className="btn btn-primary shrink-0">
            Go to Connect
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="pc-col">
          {/* ── Step 1 — where the post goes ─────────────────────── */}
          <section className="pc-step">
            <div className="pc-step-head">
              <span className={"pc-step-num" + (step1Done ? " is-done" : "")}>
                {step1Done ? <FiCheck className="h-3.5 w-3.5" /> : "1"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="pc-step-title">Choose destinations</p>
                <p className="pc-step-sub">
                  {activeTargets.length > 0
                    ? `Publishing to ${activeTargets
                        .map((t) => t.label)
                        .join(", ")}`
                    : "Pick at least one connected platform"}
                </p>
              </div>
              <FiUsers className="hidden h-4 w-4 shrink-0 text-slate-500 sm:block" />
            </div>

            <div className="pc-step-body">
              <div className="grid gap-2 sm:grid-cols-2">
                {PLATFORMS.map(({ id, label, Icon, accent }) => {
                  const isConnected = connected[id];
                  const isOn = selected[id] && isConnected;
                  const planned = plannedStatus(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!isConnected || publishing}
                      onClick={() => togglePlatform(id)}
                      aria-pressed={isOn}
                      className={"pc-plat" + (isOn ? " is-on" : "")}
                    >
                      <Icon className={"h-5 w-5 shrink-0 " + accent} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {label}
                        </p>
                        {!isConnected ? (
                          <p className="text-xs text-slate-500">Not connected</p>
                        ) : !isOn ? (
                          <p className="text-xs text-slate-500">Off</p>
                        ) : id === "facebook" ? (
                          <p className="truncate text-xs text-slate-400">
                            {selectedPageIds.length > 0
                              ? `${selectedPageIds.length} Page${
                                  selectedPageIds.length > 1 ? "s" : ""
                                } selected`
                              : "Pick Pages below"}
                          </p>
                        ) : id === "youtube" && ytChannels.length > 1 ? (
                          <p className="truncate text-xs text-slate-400">
                            {selectedYtIds.length > 0
                              ? `${selectedYtIds.length} channel${
                                  selectedYtIds.length > 1 ? "s" : ""
                                } selected`
                              : "Pick channels below"}
                          </p>
                        ) : (
                          (() => {
                            const dest = destinationFor(id);
                            return (
                              <p className="truncate text-xs text-slate-400">
                                {dest ? `→ ${dest.name}` : "Selected"}
                              </p>
                            );
                          })()
                        )}
                        {/* Flags a platform that's on but would be skipped, at
                            the point of choosing rather than after publishing. */}
                        {isOn && planned === STATUS.skipped && (
                          <p className="mt-0.5 truncate text-[11px] text-amber-400/90">
                            {id === "youtube"
                              ? "Needs a video"
                              : id === "instagram"
                              ? "Needs media"
                              : "Needs text or media"}
                          </p>
                        )}
                      </div>
                      <span className="pc-plat-check">
                        <FiCheck className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Facebook Pages */}
              {selected.facebook && connected.facebook && (
                <div className="pc-sub">
                  <p className="pc-sub-title text-indigo-400">
                    <FaFacebook className="h-3 w-3" /> Which Pages?
                  </p>
                  {fbPagesLoading && fbPages.length === 0 ? (
                    <p className="text-sm text-slate-500">Loading Pages…</p>
                  ) : fbPages.length === 0 ? (
                    <p className="text-sm text-slate-500">No Pages found.</p>
                  ) : (
                    <div className="scroll-slim grid max-h-40 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {fbPages.map((page) => (
                        <label key={page.id} className="pc-check">
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
                </div>
              )}

              {/* YouTube channels — only when there's a choice to make. */}
              {selected.youtube && connected.youtube && ytChannels.length > 1 && (
                <div className="pc-sub">
                  <p className="pc-sub-title text-rose-400">
                    <FaYoutube className="h-3 w-3" /> Which channels?
                  </p>
                  <div className="scroll-slim grid max-h-40 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {ytChannels.map((ch) => (
                      <label key={ch.platformId} className="pc-check">
                        <input
                          type="checkbox"
                          checked={selectedYtIds.includes(ch.platformId)}
                          onChange={() => toggleYtChannel(ch.platformId)}
                          className="h-4 w-4 accent-rose-400"
                        />
                        <span className="truncate text-sm text-slate-300">
                          {ch.platformName || ch.platformId}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    The same video, title, and privacy setting are used for every
                    checked channel.
                  </p>
                </div>
              )}

              {/* Instagram account — only when there's more than one. */}
              {selected.instagram &&
                connected.instagram &&
                igAccounts.length > 1 && (
                  <div className="pc-sub">
                    <p className="pc-sub-title text-pink-400">
                      <FaInstagram className="h-3 w-3" /> Which account?
                    </p>
                    <select
                      value={selectedIgId}
                      onChange={(e) => setSelectedIgId(e.target.value)}
                      className="field w-full text-sm"
                    >
                      {igAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.username ? `@${acc.username}` : acc.name || acc.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              {/* Resolved destination list — the literal "where does this go?"
                  answer, collapsed because it's confirmation, not a control. */}
              {activeTargets.length > 0 && (
                <details className="pc-sub">
                  <summary className="cursor-pointer list-none text-xs font-medium text-slate-400 transition-colors hover:text-slate-200">
                    <span className="inline-flex items-center gap-2">
                      <FiInfo className="h-3.5 w-3.5" />
                      Review the exact accounts
                    </span>
                  </summary>
                  <div className="mt-2 border-t border-white/10 pt-1">
                    {activeTargets.map(({ id, label, Icon, accent }) => {
                      if (id === "facebook") {
                        return fbPages
                          .filter((p) => selectedPageIds.includes(p.id))
                          .map((p) => (
                            <div key={`fb-${p.id}`} className="pc-dest">
                              <Icon className={"h-4 w-4 shrink-0 " + accent} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-white">
                                  {p.name}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  {label} Page · ID: {p.id}
                                </p>
                              </div>
                            </div>
                          ));
                      }
                      const dest = destinationFor(id);
                      if (!dest) return null;
                      return (
                        <div key={id} className="pc-dest">
                          <Icon className={"h-4 w-4 shrink-0 " + accent} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-white">
                              {dest.name}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {label}
                              {dest.subId ? ` · ID: ${dest.subId}` : ""}
                            </p>
                          </div>
                          {dest.url && (
                            <a
                              href={dest.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300"
                            >
                              View <FiExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          </section>

          {/* ── Step 2 — the post itself ─────────────────────────── */}
          <section className="pc-step">
            <div className="pc-step-head">
              <span className={"pc-step-num" + (step2Done ? " is-done" : "")}>
                {step2Done ? <FiCheck className="h-3.5 w-3.5" /> : "2"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="pc-step-title">Write your post</p>
                <p className="pc-step-sub">
                  {hasText
                    ? `${text.trim().length} characters`
                    : "Type it, or let AI draft it for you"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWriterOpen(true)}
                disabled={publishing}
                className={"ai-toggle is-on" + (publishing ? " opacity-50" : "")}
              >
                <FiZap className="h-3.5 w-3.5" />
                {hasText ? "Improve with AI" : "Write with AI"}
              </button>
            </div>

            <div className="pc-step-body">
              {/* When LinkedIn is a target, the formatter drives the same `text`
                  state so Unicode styling publishes straight through. */}
              {selected.linkedin ? (
                <LinkedInFormatter value={text} onChange={setText} />
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder="What do you want to share everywhere?"
                  className="field w-full resize-none"
                />
              )}

              {/* Media. One row of dropzones until something is attached, then
                  the attachment itself replaces them. */}
              <div className="mt-4">
                <p className="pc-sub-title mb-2">
                  <FiImage className="h-3 w-3" /> Media
                </p>

                {preview ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Selected"
                      className="app-img max-h-56 rounded-xl object-cover"
                    />
                    <button
                      onClick={clearImage}
                      className="absolute right-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black"
                    >
                      Remove
                    </button>
                  </div>
                ) : video ? (
                  <div className="flex items-center gap-3 rounded-xl border border-violet-400/30 bg-violet-400/10 p-3">
                    <FiVideo className="h-5 w-5 shrink-0 text-violet-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {video.name}
                      </p>
                      <p className="tabular text-xs text-slate-400">
                        {formatBytes(video.size)}
                      </p>
                    </div>
                    <button onClick={clearVideo} className="btn btn-danger shrink-0">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <label className="pc-drop">
                      <FiImage className="h-5 w-5" />
                      <span className="text-sm font-medium">Add image</span>
                      <span className="text-xs">PNG, JPG, WebP</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onPickImage}
                        className="hidden"
                      />
                    </label>
                    <label className="pc-drop">
                      <FiVideo className="h-5 w-5" />
                      <span className="text-sm font-medium">Add video</span>
                      <span className="text-xs">MP4, MOV, WebM</span>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={onPickVideo}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {/* AI image generation, tucked under the media row it feeds.
                    The prompt and options live in a modal — there are too many
                    of them to sit inline without burying the composer. */}
                {!video && (
                  <button
                    type="button"
                    onClick={() => setImageGenOpen(true)}
                    disabled={publishing || uploading}
                    className="ai-toggle is-on mt-2.5"
                  >
                    <FiZap className="h-3.5 w-3.5" />
                    {image ? "Generate a different image" : "Generate an image with AI"}
                  </button>
                )}

                {/* Upload progress. */}
                {uploading && (
                  <div className="mt-2.5 rounded-xl border border-violet-400/30 bg-violet-400/10 px-3.5 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="inline-flex items-center gap-2 text-slate-200">
                        <FiUploadCloud className="h-4 w-4" /> Uploading{" "}
                        {video ? "video" : "image"}…
                      </span>
                      {uploadProgress && (
                        <span className="tabular shrink-0 text-xs text-slate-400">
                          {formatBytes(uploadProgress.loaded)} /{" "}
                          {formatBytes(uploadProgress.total)}
                          <span className="ml-2 font-semibold text-violet-200">
                            {uploadProgress.percent}%
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="pc-bar">
                      <span style={{ width: `${uploadProgress?.percent ?? 0}%` }} />
                    </div>
                    {/* Once the bytes are sent, the remaining wait is R2
                        finishing the write, which reports no progress. */}
                    {uploadProgress?.percent === 100 && (
                      <p className="mt-2 text-xs text-slate-400">
                        Finishing up on the server…
                      </p>
                    )}
                  </div>
                )}
                {uploadError && (
                  <p className="pc-note pc-note-err mt-2.5">
                    <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Upload failed: {uploadError}</span>
                  </p>
                )}
                {!uploading && !uploadError && hasMediaUrl && (
                  <p className="pc-note pc-note-ok mt-2.5">
                    <FiCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Media uploaded ({mediaResourceType || "file"}) — ready for
                      Instagram / Threads.
                    </span>
                  </p>
                )}

                {/* Size warnings. The pipeline limit blocks everything, so it
                    wins over the per-platform notice. */}
                {mediaSize > 0 && overPipelineLimit ? (
                  <p className="pc-note pc-note-err mt-2.5">
                    <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      This file is{" "}
                      <span className="tabular font-semibold">
                        {formatBytes(mediaSize)}
                      </span>{" "}
                      — over the{" "}
                      <span className="tabular font-semibold">
                        {formatBytes(PIPELINE_MAX_BYTES)}
                      </span>{" "}
                      this app can publish. Use a smaller file, or publish to
                      YouTube on its own.
                    </span>
                  </p>
                ) : mediaSize > 0 && oversizeTargets.length > 0 ? (
                  <p className="pc-note pc-note-warn mt-2.5">
                    <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="tabular font-semibold">
                        {formatBytes(mediaSize)}
                      </span>{" "}
                      is over the limit for{" "}
                      <span className="font-semibold">
                        {oversizeTargets
                          .map((id) => PLATFORM_MEDIA_LIMITS[id].label)
                          .join(", ")}
                      </span>
                      . Those will fail; the others still publish.
                    </span>
                  </p>
                ) : null}
              </div>

              {/* YouTube extras — only relevant with a video attached. */}
              {selected.youtube && connected.youtube && hasVideo && (
                <div className="pc-sub">
                  <p className="pc-sub-title text-rose-400">
                    <FaYoutube className="h-3 w-3" /> Video details
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="text"
                      value={ytTitle}
                      onChange={(e) => setYtTitle(e.target.value)}
                      placeholder="YouTube title"
                      maxLength={100}
                      className="field w-full"
                    />
                    <select
                      value={ytPrivacy}
                      onChange={(e) => setYtPrivacy(e.target.value)}
                      className="field text-sm"
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Per-platform limits — reference material, so collapsed. */}
              <details className="pc-sub">
                <summary className="cursor-pointer list-none text-xs font-medium text-slate-400 transition-colors hover:text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <FiInfo className="h-3.5 w-3.5" /> Media limits per platform
                  </span>
                </summary>
                <div className="mt-2 overflow-x-auto border-t border-white/10 pt-2">
                  <table className="w-full min-w-[26rem] text-left text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="pb-2 pr-4 font-medium">Platform</th>
                        <th className="pb-2 pr-4 font-medium">Max size</th>
                        <th className="pb-2 pr-4 font-medium">Max length</th>
                        <th className="pb-2 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {PLATFORMS.map((p) => {
                        const limit = PLATFORM_MEDIA_LIMITS[p.id];
                        if (!limit) return null;
                        const over = oversizeTargets.includes(p.id);
                        const { Icon } = p;
                        return (
                          <tr key={p.id} className="border-t border-white/5">
                            <td className="py-2 pr-4">
                              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                <Icon className={"h-3.5 w-3.5 " + p.accent} />
                                {p.label}
                              </span>
                            </td>
                            <td
                              className={
                                "tabular whitespace-nowrap py-2 pr-4 " +
                                (over ? "font-semibold text-amber-300" : "")
                              }
                            >
                              {formatBytes(limit.maxBytes)}
                            </td>
                            <td className="tabular whitespace-nowrap py-2 pr-4">
                              {formatDuration(limit.maxSeconds)}
                            </td>
                            <td className="py-2 text-slate-500">{limit.note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2.5 border-t border-white/5 pt-2.5 text-xs text-slate-500">
                    Publishing to several platforms at once means the smallest
                    limit applies. This app caps uploads at{" "}
                    <span className="tabular font-medium text-slate-400">
                      {formatBytes(PIPELINE_MAX_BYTES)}
                    </span>{" "}
                    because the publish path holds the whole file in memory.
                  </p>
                </div>
              </details>
            </div>
          </section>

          {/* ── Step 3 — publish progress. Only once a run has started. ── */}
          {steps.length > 0 && (
            <section className="pc-step">
              <div className="pc-step-head">
                <span className={"pc-step-num" + (allDone ? " is-done" : "")}>
                  {allDone ? <FiCheck className="h-3.5 w-3.5" /> : "3"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="pc-step-title">
                    {allDone ? "Publish results" : "Publishing…"}
                  </p>
                  <p className="pc-step-sub tabular">
                    {doneCount} of {steps.length} done
                  </p>
                </div>
              </div>
              <div className="pc-step-body">
                {/* Overall progress, so a long multi-target run reads at a
                    glance without counting rows. */}
                <div className="pc-bar mb-3.5">
                  <span
                    style={{
                      width: `${Math.round((doneCount / steps.length) * 100)}%`,
                    }}
                  />
                </div>
                <ol>
                  {steps.map((s) => {
                    const meta = PLATFORMS.find((p) => p.id === s.platform);
                    const Icon = meta?.Icon;
                    const state =
                      s.status === STATUS.done
                        ? " is-done"
                        : s.status === STATUS.failed
                        ? " is-failed"
                        : s.status === STATUS.running
                        ? " is-running"
                        : "";
                    return (
                      <li key={s.key} className="pc-run">
                        <span className={"pc-run-dot" + state}>
                          {s.status === STATUS.done ? (
                            <FiCheck className="h-3.5 w-3.5" />
                          ) : s.status === STATUS.failed ? (
                            <FiX className="h-3.5 w-3.5" />
                          ) : s.status === STATUS.running ? (
                            <FiLoader className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FiClock className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className={"pc-run-card" + state}>
                          <div className="flex items-center gap-2">
                            {Icon && (
                              <Icon className={"h-4 w-4 shrink-0 " + meta.accent} />
                            )}
                            <p className="truncate text-sm font-semibold text-white">
                              {meta?.label ?? s.platform}
                              {/* Names the specific Page/account, so several
                                  Facebook rows are tellable apart. */}
                              {s.destinationName && (
                                <span className="ml-1.5 font-normal text-slate-400">
                                  · {s.destinationName}
                                </span>
                              )}
                            </p>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {s.message}
                          </p>
                          {s.permalink && (
                            <a
                              href={s.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200"
                            >
                              View post <FiExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
          )}

          {/* Blockers — stated before the action bar so the disabled publish
              button always has a visible reason next to it. */}
          {(fbNeedsPage || ytNeedsTitle || ytNeedsChannel) && (
            <div className="mt-3 space-y-2">
              {fbNeedsPage && (
                <p className="pc-note pc-note-warn">
                  <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Select at least one Facebook Page.</span>
                </p>
              )}
              {ytNeedsChannel && (
                <p className="pc-note pc-note-warn">
                  <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Select at least one YouTube channel.</span>
                </p>
              )}
              {ytNeedsTitle && (
                <p className="pc-note pc-note-warn">
                  <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Add a YouTube title for the video.</span>
                </p>
              )}
            </div>
          )}

          {saveMsg && (
            <p className="pc-note pc-note-ok mt-3 items-center justify-between">
              <span>{saveMsg}</span>
              <Link
                href="/profile/posts"
                className="shrink-0 font-medium underline underline-offset-2"
              >
                View posts →
              </Link>
            </p>
          )}

          {/* Reserves the room the sticky bar floats over, so the content
              above it can always be scrolled clear of it. */}
          <div className="pc-spacer" aria-hidden />

          {/* Sticky action bar — the publish button stays reachable however
              long the form gets. */}
          <div className="pc-actions">
            <span className="text-sm text-slate-400">
              {activeTargets.length > 0 ? (
                <>
                  <span className="tabular font-semibold text-white">
                    {activeTargets.length}
                  </span>{" "}
                  destination{activeTargets.length > 1 ? "s" : ""} ready
                </>
              ) : (
                "Select a connected platform"
              )}
            </span>
            {allDone ? (
              <button onClick={reset} className="btn btn-primary">
                <FiPlus className="h-4 w-4" /> New post
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onSaveDraft}
                  disabled={saving || uploading || !hasContent}
                  className="btn btn-ghost"
                >
                  {saving ? "Saving…" : "Save as draft"}
                </button>
                <button
                  onClick={onSaveAndPublish}
                  disabled={saving || !canPublish}
                  className="btn btn-primary"
                >
                  {saving || publishing ? (
                    <>
                      <FiLoader className="h-4 w-4 animate-spin" /> Publishing…
                    </>
                  ) : (
                    <>
                      <FiSend className="h-4 w-4" /> Publish now
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column: live preview, sticky so it follows while you scroll
            the controls. */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <LinkedInPreview
            text={text}
            authorName={accountMeta.linkedin?.platformName || "Your Name"}
            mediaUrl={mediaUrl || preview || ""}
            mediaType={mediaResourceType || (preview ? "image" : null)}
          />
        </div>
      </div>

      {/* AI post writer. Given the active targets so the wording suits the
          platforms actually being published to, and the current draft so it can
          revise rather than replace. */}
      <AiPostWriter
        open={writerOpen}
        onClose={() => setWriterOpen(false)}
        onUse={setText}
        platforms={activeTargets.map((p) => p.id)}
        current={text}
      />

      {/* AI image generator. Given the post's text so it can suggest a prompt
          that matches what the post is actually about. */}
      <AiImageGenerator
        open={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onUse={onGeneratedImage}
        postText={text}
      />

      <p className="pretty mt-6 text-sm text-slate-500">
        Manage connections on the{" "}
        <Link
          href="/connect"
          className="font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white"
        >
          Connect
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
