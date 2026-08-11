// Per-platform media limits, shown on the publish page so a video that a
// platform will reject is caught before publishing rather than after.
//
// Two different ceilings apply and they're worth keeping straight:
//
//  - `maxBytes` / `maxSeconds` are the PLATFORM's published limits. Exceeding
//    them means that platform rejects the post; the others still go through.
//  - PIPELINE_MAX_BYTES is OUR limit. The publish path buffers the whole file
//    in memory (R2 -> Blob -> FormData -> each share route), so a large video
//    fails on our side before any platform ever sees it. This is lower than
//    every platform limit and is what actually binds today.
//
// Sources: each platform's own upload docs (see the publish page's limits
// table). Numbers change; they're kept here so there's one place to update.

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLATFORM_MEDIA_LIMITS = {
  linkedin: {
    label: "LinkedIn",
    maxBytes: 5 * GB,
    maxSeconds: 30 * 60,
    note: "Video up to 30 min",
  },
  facebook: {
    label: "Facebook",
    maxBytes: 10 * GB,
    maxSeconds: 4 * 60 * 60,
    note: "Most generous of the five",
  },
  instagram: {
    label: "Instagram",
    maxBytes: 1 * GB,
    maxSeconds: 15 * 60,
    note: "Reels — the tightest size limit",
  },
  threads: {
    label: "Threads",
    maxBytes: 1 * GB,
    maxSeconds: 5 * 60,
    note: "Shortest duration limit",
  },
  youtube: {
    label: "YouTube",
    maxBytes: 256 * GB,
    maxSeconds: 12 * 60 * 60,
    note: "Effectively unlimited here",
  },
};

// What our own publish pipeline can carry, and the lowest ceiling in practice.
//
// The upload itself is no longer the constraint: the browser PUTs straight to
// R2, so nothing passes through a serverless function on the way in. What binds
// is publishing. The publish route downloads the media into a Blob once and
// shares that one Blob across every byte-uploading target (YouTube, LinkedIn,
// Facebook), so peak memory is roughly one copy of the file rather than one per
// platform. Instagram and Threads add nothing — they fetch by URL.
//
// 500 MB keeps that single copy well inside a serverless function's memory
// while covering ordinary social video. Going meaningfully higher means
// streaming R2 -> platform instead of buffering, which is a larger change.
//
// Note this is still under every platform's own limit (Instagram and Threads
// are the tightest at 1 GB), so it remains the binding constraint.
export const PIPELINE_MAX_BYTES = 500 * MB;

export function formatBytes(bytes) {
  if (bytes >= GB) {
    const gb = bytes / GB;
    // 1 GB, not 1.0 GB; 1.5 GB keeps its decimal.
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  if (bytes >= MB) {
    const mb = bytes / MB;
    // Below 10 MB a decimal is worth showing — live upload progress otherwise
    // jumps in whole megabytes and reads as stalled on a small file.
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  // Round up, so a partially-sent chunk never reads as 0 KB — but keep a true
  // zero (the moment an upload starts) honest.
  return bytes === 0 ? "0 KB" : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

export function formatDuration(seconds) {
  if (seconds >= 3600) {
    const h = seconds / 3600;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} hr`;
  }
  return `${Math.round(seconds / 60)} min`;
}

// Which of the given platforms would reject this file on size. Returns [] when
// the file fits everywhere (or when there's nothing to check).
export function platformsOverLimit(sizeBytes, platformIds = []) {
  if (!sizeBytes) return [];
  return platformIds.filter((id) => {
    const limit = PLATFORM_MEDIA_LIMITS[id];
    return limit && sizeBytes > limit.maxBytes;
  });
}
