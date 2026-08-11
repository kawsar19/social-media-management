// Client-side helpers for reading/writing connected social accounts from the
// DB (via /api/accounts) instead of localStorage. All calls are authenticated
// with the app JWT that AuthProvider stores under "social_manager_auth".
//
// Platform tokens themselves live server-side in the SocialAccount collection;
// these helpers hand the current access token back to the client so the
// existing consumer routes (which take Bearer <platform_token>) keep working.

const AUTH_KEY = "social_manager_auth";

// The app JWT (NOT a platform token). Needed to authorize /api/accounts calls.
export function getAppToken() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.token ?? null;
  } catch {
    return null;
  }
}

function authHeaders() {
  const jwt = getAppToken();
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

// Called when an authenticated request comes back 401 — i.e. the app JWT is
// missing/expired/invalid. We wipe the stored auth (so the guard in the layout
// stops treating the user as logged in) and send them to /login to get a fresh
// token. Without this, an expired token leaves the app stuck: it thinks you're
// logged in (localStorage still has an object) while every API call fails, so
// everything reads as "Not Connected" instead of prompting a re-login.
function clearAuthAndRedirect() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    // ignore storage errors
  }
  const here = window.location.pathname + window.location.search;
  // Avoid redirect loops if we're already on the login page.
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = `/login?redirect=${encodeURIComponent(here)}`;
  }
}

// All connected accounts for the logged-in user: [{ platform, platformId,
// platformName, accessToken, expiresAt, ... }]. Returns [] when logged out.
export async function fetchAccounts() {
  const jwt = getAppToken();
  if (!jwt) return [];
  const res = await fetch("/api/accounts", {
    headers: authHeaders(),
    cache: "no-store",
  });
  // A stored-but-expired/invalid JWT: log the user out and re-prompt instead of
  // silently showing everything as "Not Connected".
  if (res.status === 401) {
    clearAuthAndRedirect();
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.accounts) ? data.accounts : [];
}

// Persist (upsert) one connected account. `account` must include platform,
// platformId, platformName, accessToken, and optionally refreshToken/
// expiresAt/scope.
export async function saveAccount(account) {
  const jwt = getAppToken();
  if (!jwt) throw new Error("not_logged_in");
  const res = await fetch("/api/accounts", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.formErrors?.[0] || data.error || "save_failed");
  }
  const data = await res.json();
  return data.account;
}

// Remove a connected account by its DB _id.
export async function deleteAccount(id) {
  const jwt = getAppToken();
  if (!jwt || !id) return;
  await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

// The current access token for a platform, or null if not connected. For
// non-YouTube platforms this is whatever was stored at connect time (these
// tokens still expire per the platform's own lifetime — only YouTube auto-
// refreshes; see getYouTubeToken).
export async function getPlatformToken(platform) {
  const accounts = await fetchAccounts();
  const acct = accounts.find((a) => a.platform === platform);
  return acct?.accessToken ?? null;
}

// A map of platform -> { accessToken, platformId, platformName } for every
// connected account, for pages that read several platforms at once. Does NOT
// auto-refresh YouTube — use getYouTubeToken() when you need a fresh YT token.
export async function getAccountsMap() {
  const accounts = await fetchAccounts();
  const map = {};
  for (const a of accounts) {
    map[a.platform] = {
      accessToken: a.accessToken,
      platformId: a.platformId,
      platformName: a.platformName,
    };
  }
  return map;
}

// A guaranteed-fresh YouTube access token. Hits /api/auth/youtube/token, which
// refreshes server-side via the stored refresh_token when the token has
// expired. Returns the accessToken string or throws with a reason (e.g.
// reauth_required). Pass an optional accountId to refresh a specific channel's
// token (for users with multiple connected YouTube channels).
export async function getYouTubeToken(accountId) {
  const jwt = getAppToken();
  if (!jwt) throw new Error("not_logged_in");
  const url = accountId
    ? `/api/auth/youtube/token?accountId=${encodeURIComponent(accountId)}`
    : "/api/auth/youtube/token";
  const res = await fetch(url, {
    headers: authHeaders(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "youtube_token_failed");
  return data.accessToken;
}

// PUT the file straight to a presigned R2 URL, reporting progress as it goes.
//
// XMLHttpRequest rather than fetch: fetch gives no way to observe upload
// progress, and a video takes long enough that a bare spinner leaves the user
// unable to tell a slow upload from a stuck one.
function putToR2(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    // Send the same Content-Type the URL was signed with, so the object is
    // stored with the right type — that's what makes Instagram and Threads
    // treat it as a video rather than a download. No auth header: the
    // signature in the URL is the authorisation, and adding one breaks it.
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        // lengthComputable is false when the total size isn't known; reporting
        // a percent from an unknown total would show a bogus bar.
        if (!e.lengthComputable) return;
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        });
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        // R2 answers with XML, not JSON, so there's no error field to read.
        // The status is what distinguishes the cases worth naming.
        reject(
          new Error(
            xhr.status === 403
              ? "upload_link_expired"
              : `upload_failed_${xhr.status}`
          )
        );
        return;
      }
      resolve();
    });

    // A CORS rejection surfaces here as a bare error with no status: the
    // browser blocks the request before R2 ever sees it.
    xhr.addEventListener("error", () => reject(new Error("network_error")));
    xhr.addEventListener("abort", () => reject(new Error("upload_aborted")));

    xhr.send(file);
  });
}

// Upload a File (image or video) to R2 and get back a public https URL.
// Instagram and Threads fetch media by URL rather than accepting uploaded
// files, so this turns a local file pick into a URL they can consume. A video
// URL is short-lived — the publish route deletes the object once publishing is
// done; image URLs are kept so saved posts keep their preview.
//
// Two steps: ask /api/upload for a presigned URL, then PUT the file straight to
// R2. The file never passes through our server, which is what lets a 100 MB
// video upload at all — routing it through a serverless function ran into that
// platform's request-size and duration caps.
//
// `onProgress` is called with { loaded, total, percent } as the bytes go out.
//
// Returns { url, resourceType } or throws with a reason.
export async function uploadMedia(file, onProgress) {
  const jwt = getAppToken();
  if (!jwt) throw new Error("not_logged_in");

  // Step 1: presign. Small and quick — no file bytes are sent here.
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });

  if (res.status === 401) {
    clearAuthAndRedirect();
    throw new Error("unauthorized");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "upload_failed");

  // Step 2: the actual transfer, browser to R2.
  await putToR2(data.uploadUrl, file, onProgress);

  // The public URL only resolves once the PUT has succeeded, so it's returned
  // after the upload rather than alongside the signed URL.
  return { url: data.url, resourceType: data.resourceType };
}
