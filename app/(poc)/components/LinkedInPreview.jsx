"use client";

// LinkedIn Post Preview — a faux LinkedIn feed card that renders whatever the
// user is typing (Unicode styling and all) exactly as it will look once posted,
// like the preview panel on typegrow.com. Pure presentational: it just displays
// `text` (and optional author/media). No library — plain Tailwind to match the
// rest of the app.

import { useState } from "react";
import {
  FaThumbsUp,
  FaRegComment,
  FaRetweet,
  FaRegPaperPlane,
} from "react-icons/fa6";
import { FiSmartphone, FiMonitor } from "react-icons/fi";

// LinkedIn truncates long posts behind a "…more" after ~3 lines / ~210 chars.
// We mimic that so the preview is honest about what people see in-feed.
const SEE_MORE_AT = 210;

export default function LinkedInPreview({
  text = "",
  authorName = "Your Name",
  authorHeadline = "Your headline • Social Media Manager",
  avatarUrl = null,
  mediaUrl = null,
  mediaType = null, // "image" | "video" | null
}) {
  const [device, setDevice] = useState("mobile");
  const [expanded, setExpanded] = useState(false);

  const isLong = text.length > SEE_MORE_AT;
  const shown = expanded || !isLong ? text : text.slice(0, SEE_MORE_AT);

  const initials =
    authorName
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "You";

  return (
    // The outer chrome follows the app theme; the card inside stays white
    // because that IS the LinkedIn card being previewed.
    <div className="pc-step p-3">
      {/* Preview header + device toggle */}
      <div className="mb-3 flex items-center justify-between">
        <span className="pc-sub-title mb-0">Post preview</span>
        <div className="ai-segment gap-0.5 p-0.5">
          <button
            type="button"
            title="Mobile"
            aria-label="Mobile"
            aria-pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
            className={
              "ai-segment-btn flex-none px-2 py-1.5" +
              (device === "mobile" ? " is-active" : "")
            }
          >
            <FiSmartphone className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Desktop"
            aria-label="Desktop"
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
            className={
              "ai-segment-btn flex-none px-2 py-1.5" +
              (device === "desktop" ? " is-active" : "")
            }
          >
            <FiMonitor className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* The card. On mobile we constrain width to ~a phone; desktop is wider. */}
      <div className="flex justify-center">
        <div
          className="overflow-hidden rounded-xl bg-white text-slate-900 shadow-lg"
          style={{ width: device === "mobile" ? 360 : "100%", maxWidth: "100%" }}
        >
          {/* Author row */}
          <div className="flex items-start gap-2.5 p-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                {authorName}
              </p>
              <p className="truncate text-xs leading-tight text-slate-500">
                {authorHeadline}
              </p>
              <p className="text-xs leading-tight text-slate-500">12h • 🌐</p>
            </div>
          </div>

          {/* Post body — preserves line breaks and Unicode styling */}
          <div className="px-3 pb-2">
            <p className="whitespace-pre-wrap break-words text-sm leading-snug text-slate-800">
              {shown || (
                <span className="text-slate-400">
                  Start typing to see your LinkedIn post preview…
                </span>
              )}
              {isLong && !expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="ml-1 text-slate-500 hover:text-sky-600"
                >
                  …more
                </button>
              )}
            </p>
          </div>

          {/* Optional media */}
          {mediaUrl && mediaType === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="w-full object-cover" />
          )}
          {mediaUrl && mediaType === "video" && (
            <video src={mediaUrl} controls className="w-full" />
          )}

          {/* Engagement counts */}
          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-600 text-[9px] text-white">
                👍
              </span>
              57
            </span>
            <span>24 comments • 6 reposts</span>
          </div>

          <div className="mx-3 border-t border-slate-200" />

          {/* Action buttons (visual only) */}
          <div className="grid grid-cols-4 py-1 text-slate-600">
            {[
              { Icon: FaThumbsUp, label: "Like" },
              { Icon: FaRegComment, label: "Comment" },
              { Icon: FaRetweet, label: "Repost" },
              { Icon: FaRegPaperPlane, label: "Send" },
            ].map(({ Icon, label }) => (
              <button
                key={label}
                type="button"
                className="flex items-center justify-center gap-1.5 rounded py-2 text-xs font-medium hover:bg-slate-100"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
