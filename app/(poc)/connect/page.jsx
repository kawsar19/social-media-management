"use client";

import { useEffect, useState } from "react";
import {
  FaLinkedin,
  FaFacebook,
  FaYoutube,
  FaInstagram,
  FaThreads,
  FaXTwitter,
  FaTiktok,
} from "react-icons/fa6";
import { FiCheck } from "react-icons/fi";
import { getEnabledPageIds, setEnabledPageIds } from "../lib/enabledPages";

const LINKEDIN_CLIENT_ID = "869sxzia2ogeui";
const REDIRECT_URI = "http://localhost:3001/api/auth/linkedin/callback";
const SCOPE = "openid profile email w_member_social";
const STORAGE_KEY = "linkedin_access_token";
const FB_STORAGE_KEY = "facebook_user_access_token";

function buildLinkedInAuthUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: LINKEDIN_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state: "poc",
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

// Facebook OAuth ("Login with Facebook"). The App ID and redirect URI are
// public values (same as LinkedIn's client_id above), so they live in the
// client. The App Secret stays server-side in .env.local and is only used by
// the callback route to exchange the code for a token.
const FB_APP_ID = "1363634801765963";
const FB_REDIRECT_URI = "http://localhost:3001/api/auth/facebook/callback";
const FB_SCOPE =
  "public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish";
const FB_GRAPH_VERSION = "v25.0";

function buildFacebookAuthUrl() {
  const params = new URLSearchParams({
    client_id: FB_APP_ID,
    redirect_uri: FB_REDIRECT_URI,
    scope: FB_SCOPE,
    response_type: "code",
    state: "poc",
  });
  return `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

// YouTube = Google OAuth. The Client ID is public (exposed via NEXT_PUBLIC_*);
// the Client Secret stays server-side and is only used by the callback route.
const YT_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const YT_REDIRECT_URI = "http://localhost:3001/api/auth/youtube/callback";
const YT_STORAGE_KEY = "youtube_access_token";
// Scopes: readonly (channel/videos) + force-ssl (comment reply) +
// yt-analytics.readonly (analytics) + upload (publish videos). Note: on an
// unverified Google app, videos uploaded with youtube.upload are forced to
// private-locked until the app passes verification.
const YT_SCOPE = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
].join(" ");

function buildYouTubeAuthUrl() {
  const params = new URLSearchParams({
    client_id: YT_CLIENT_ID,
    redirect_uri: YT_REDIRECT_URI,
    response_type: "code",
    scope: YT_SCOPE,
    // access_type=offline + prompt=consent would return a refresh_token; we
    // don't persist one in this POC, so the token just lasts ~1 hour.
    include_granted_scopes: "true",
    state: "poc",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Threads OAuth. Separate Meta app from Facebook — its own App ID, redirect,
// and host (threads.net). The App ID is public (exposed via NEXT_PUBLIC_*); the
// Secret stays server-side and is only used by the callback route. Scopes:
// threads_basic (read profile) + threads_content_publish (create posts).
const TH_APP_ID = process.env.NEXT_PUBLIC_THREADS_APP_ID || "";
// Meta blocks http/localhost OAuth, so this is a public https URL (ngrok tunnel)
// read from env — it must match THREADS_REDIRECT_URI the callback route uses.
const TH_REDIRECT_URI =
  process.env.NEXT_PUBLIC_THREADS_REDIRECT_URI ||
  "http://localhost:3001/api/auth/threads/callback";
const TH_SCOPE = "threads_basic,threads_content_publish";
const TH_STORAGE_KEY = "threads_access_token";
const TH_USER_ID_KEY = "threads_user_id";

function buildThreadsAuthUrl() {
  const params = new URLSearchParams({
    client_id: TH_APP_ID,
    redirect_uri: TH_REDIRECT_URI,
    response_type: "code",
    scope: TH_SCOPE,
    state: "poc",
  });
  return `https://threads.net/oauth/authorize?${params.toString()}`;
}

export default function ConnectPage() {
  const [token, setToken] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Facebook: connected via the "Login with Facebook" OAuth redirect. The
  // callback route returns the user access token in the URL hash, same as
  // LinkedIn. We then list the Pages this user can manage.
  const [fbToken, setFbToken] = useState(null);
  const [fbPages, setFbPages] = useState([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbError, setFbError] = useState(null);

  // Which Pages the user has chosen to show across the app. Empty = show all.
  const [enabledPageIds, setEnabledPageIdsState] = useState([]);

  // YouTube: connected via Google OAuth. The callback returns the access token
  // in the URL hash (yt_access_token), same pattern as Facebook. We then load
  // the user's channel to confirm the connection.
  const [ytToken, setYtToken] = useState(null);
  const [ytChannel, setYtChannel] = useState(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState(null);

  // Instagram: has no standalone login. A linked Instagram Business/Creator
  // account is discovered through the Facebook Page it belongs to, so it rides
  // on the same fbToken. Whenever fbToken is present we ask
  // /api/auth/instagram/accounts which Pages have a linked IG account.
  const [igAccounts, setIgAccounts] = useState([]);
  const [igLoading, setIgLoading] = useState(false);
  const [igError, setIgError] = useState(null);

  // Threads: standalone OAuth (its own Meta app), same pattern as YouTube. The
  // callback returns the access token + Threads user id in the URL hash; we
  // save both and load the profile to confirm the connection.
  const [thToken, setThToken] = useState(null);
  const [thProfile, setThProfile] = useState(null);
  const [thLoading, setThLoading] = useState(false);
  const [thError, setThError] = useState(null);

  // On mount: read the access token from the URL hash (set by the callback
  // route), save it to localStorage, then clean the URL. Also restore any
  // previously saved token.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setErrorMsg(err);
      window.history.replaceState(null, "", "/connect");
    }

    if (window.location.hash) {
      const hash = new URLSearchParams(window.location.hash.slice(1));

      // Facebook callback returns its token under fb_access_token so it can be
      // told apart from LinkedIn's access_token.
      const fbAccessToken = hash.get("fb_access_token");
      if (fbAccessToken) {
        localStorage.setItem(FB_STORAGE_KEY, fbAccessToken);
        setFbToken(fbAccessToken);
        window.history.replaceState(null, "", "/connect");
        return;
      }

      // YouTube callback returns its token under yt_access_token.
      const ytAccessToken = hash.get("yt_access_token");
      if (ytAccessToken) {
        localStorage.setItem(YT_STORAGE_KEY, ytAccessToken);
        setYtToken(ytAccessToken);
        window.history.replaceState(null, "", "/connect");
        return;
      }

      // Threads callback returns its token under threads_access_token, plus the
      // Threads user id (needed later to publish as this account).
      const thAccessToken = hash.get("threads_access_token");
      if (thAccessToken) {
        localStorage.setItem(TH_STORAGE_KEY, thAccessToken);
        const thUserId = hash.get("threads_user_id");
        if (thUserId) localStorage.setItem(TH_USER_ID_KEY, thUserId);
        setThToken(thAccessToken);
        window.history.replaceState(null, "", "/connect");
        return;
      }

      const accessToken = hash.get("access_token");
      if (accessToken) {
        localStorage.setItem(STORAGE_KEY, accessToken);
        setToken(accessToken);
        window.history.replaceState(null, "", "/connect");
        return;
      }
    }

    setToken(localStorage.getItem(STORAGE_KEY));
  }, []);

  // Whenever we have a token, fetch the LinkedIn profile via /v2/userinfo.
  useEffect(() => {
    if (!token) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);

    fetch("/api/auth/linkedin/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(data.error || "Failed to load LinkedIn profile");
          setProfile(null);
        } else {
          setProfile(data);
        }
      })
      .catch(() => {
        if (!cancelled) setErrorMsg("Failed to load LinkedIn profile");
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // On mount: restore a previously saved Facebook token + enabled-Pages choice.
  useEffect(() => {
    setFbToken(localStorage.getItem(FB_STORAGE_KEY));
    setEnabledPageIdsState(getEnabledPageIds());
  }, []);

  // On mount: restore a previously saved YouTube token.
  useEffect(() => {
    setYtToken(localStorage.getItem(YT_STORAGE_KEY));
  }, []);

  // On mount: restore a previously saved Threads token.
  useEffect(() => {
    setThToken(localStorage.getItem(TH_STORAGE_KEY));
  }, []);

  // Whenever we have a Threads token, load the profile via our
  // /api/auth/threads/profile proxy to confirm the connection.
  useEffect(() => {
    if (!thToken) {
      setThProfile(null);
      return;
    }

    let cancelled = false;
    setThLoading(true);
    setThError(null);

    fetch("/api/auth/threads/profile", {
      headers: { Authorization: `Bearer ${thToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          // Most likely an expired/invalid token.
          setThError(data.error || "Failed to load Threads profile");
          setThProfile(null);
        } else {
          setThProfile(data);
        }
      })
      .catch(() => {
        if (!cancelled) setThError("Failed to load Threads profile");
      })
      .finally(() => {
        if (!cancelled) setThLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [thToken]);

  // Whenever we have a YouTube token, load the channel to confirm the
  // connection via our /api/auth/youtube/channel proxy.
  useEffect(() => {
    if (!ytToken) {
      setYtChannel(null);
      return;
    }

    let cancelled = false;
    setYtLoading(true);
    setYtError(null);

    fetch("/api/auth/youtube/channel", {
      headers: { Authorization: `Bearer ${ytToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          // Most likely an expired token (Google tokens last ~1 hour).
          setYtError(data.error || "Failed to load YouTube channel");
          setYtChannel(null);
        } else {
          setYtChannel(data.channel || null);
        }
      })
      .catch(() => {
        if (!cancelled) setYtError("Failed to load YouTube channel");
      })
      .finally(() => {
        if (!cancelled) setYtLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ytToken]);

  // Whenever we have a Facebook token, fetch the Pages it can manage
  // via our /api/auth/facebook/pages proxy (which calls /me/accounts).
  useEffect(() => {
    if (!fbToken) {
      setFbPages([]);
      return;
    }

    let cancelled = false;
    setFbLoading(true);
    setFbError(null);

    fetch("/api/auth/facebook/pages", {
      headers: { Authorization: `Bearer ${fbToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setFbError(data.error || "Failed to load Facebook Pages");
          setFbPages([]);
        } else {
          setFbPages(data.pages || []);
        }
      })
      .catch(() => {
        if (!cancelled) setFbError("Failed to load Facebook Pages");
      })
      .finally(() => {
        if (!cancelled) setFbLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fbToken]);

  // Instagram rides on the Facebook token: whenever we have one, ask which
  // Pages have a linked Instagram Business/Creator account. Empty result just
  // means no IG account is linked (or the instagram_* scopes weren't granted).
  useEffect(() => {
    if (!fbToken) {
      setIgAccounts([]);
      return;
    }

    let cancelled = false;
    setIgLoading(true);
    setIgError(null);

    fetch("/api/auth/instagram/accounts", {
      headers: { Authorization: `Bearer ${fbToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setIgError(data.error || "Failed to load Instagram accounts");
          setIgAccounts([]);
        } else {
          setIgAccounts(data.accounts || []);
        }
      })
      .catch(() => {
        if (!cancelled) setIgError("Failed to load Instagram accounts");
      })
      .finally(() => {
        if (!cancelled) setIgLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fbToken]);

  function connectFacebook() {
    window.location.href = buildFacebookAuthUrl();
  }

  function disconnectFacebook() {
    localStorage.removeItem(FB_STORAGE_KEY);
    setFbToken(null);
    setFbPages([]);
    setFbError(null);
  }

  function connectYouTube() {
    if (!YT_CLIENT_ID) {
      setYtError(
        "Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID — add your Google Client ID to .env.local"
      );
      return;
    }
    window.location.href = buildYouTubeAuthUrl();
  }

  function disconnectYouTube() {
    localStorage.removeItem(YT_STORAGE_KEY);
    setYtToken(null);
    setYtChannel(null);
    setYtError(null);
  }

  function connectThreads() {
    if (!TH_APP_ID) {
      setThError(
        "Missing NEXT_PUBLIC_THREADS_APP_ID — add your Threads App ID to .env.local"
      );
      return;
    }
    window.location.href = buildThreadsAuthUrl();
  }

  function disconnectThreads() {
    localStorage.removeItem(TH_STORAGE_KEY);
    localStorage.removeItem(TH_USER_ID_KEY);
    setThToken(null);
    setThProfile(null);
    setThError(null);
  }

  // Manual token path: paste a token straight from Meta's Threads token
  // generator (developers.facebook.com/apps/.../threads) instead of running the
  // OAuth redirect. Saving it triggers the same profile-load effect as OAuth.
  function saveThreadsToken(raw) {
    const t = raw.trim();
    if (!t) return;
    localStorage.setItem(TH_STORAGE_KEY, t);
    setThToken(t);
    setThError(null);
  }

  // Toggle whether a Page is shown across the app, and persist the choice.
  function togglePageEnabled(pageId) {
    const next = enabledPageIds.includes(pageId)
      ? enabledPageIds.filter((id) => id !== pageId)
      : [...enabledPageIds, pageId];
    setEnabledPageIdsState(next);
    setEnabledPageIds(next);
  }

  function connectLinkedIn() {
    window.location.href = buildLinkedInAuthUrl();
  }

  function disconnectLinkedIn() {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setProfile(null);
  }

  const platforms = [
    {
      name: "LinkedIn",
      Icon: FaLinkedin,
      isLinkedIn: true,
      connected: Boolean(token),
      account: profile?.name || "LinkedIn Account",
      onConnect: connectLinkedIn,
      onDisconnect: disconnectLinkedIn,
    },
    {
      name: "Facebook",
      Icon: FaFacebook,
      isFacebook: true,
      connected: Boolean(fbToken),
      account:
        fbPages.length > 0
          ? fbPages.map((p) => p.name).join(", ")
          : "Facebook Account",
      onConnect: connectFacebook,
      onDisconnect: disconnectFacebook,
    },
    {
      name: "YouTube",
      Icon: FaYoutube,
      isYouTube: true,
      connected: Boolean(ytToken),
      account: ytChannel?.title || "YouTube Channel",
      onConnect: connectYouTube,
      onDisconnect: disconnectYouTube,
    },
    {
      name: "Instagram",
      Icon: FaInstagram,
      isInstagram: true,
      // Instagram is reached through Facebook, so it's "connected" once we've
      // found at least one linked IG Business account on the Facebook token.
      connected: igAccounts.length > 0,
      account:
        igAccounts.length > 0
          ? igAccounts.map((a) => `@${a.username}`).join(", ")
          : "Instagram Account",
      // Connecting Instagram == connecting Facebook (it grants the instagram_*
      // scopes). Disconnecting IG means dropping the Facebook token too.
      onConnect: connectFacebook,
      onDisconnect: disconnectFacebook,
    },
    {
      name: "Threads",
      Icon: FaThreads,
      isThreads: true,
      connected: Boolean(thToken),
      account: thProfile?.username
        ? `@${thProfile.username}`
        : "Threads Account",
      onConnect: connectThreads,
      onDisconnect: disconnectThreads,
    },
    { name: "X", Icon: FaXTwitter, connected: false },
    { name: "TikTok", Icon: FaTiktok, connected: false },
  ];

  const connectedCount = platforms.filter((p) => p.connected).length;

  // Presentation-only: per-platform accent styling keyed off the platform name.
  // Does not change any data — purely picks Tailwind classes for the accent
  // glow, icon tile, and connected pill of each card.
  const accentFor = (name) => {
    switch (name) {
      case "YouTube":
        return {
          text: "text-rose-400",
          ring: "ring-rose-400/20",
          glow: "from-rose-500/20",
          tile: "border-rose-400/20 bg-rose-400/10",
          dot: "bg-rose-400",
        };
      case "Facebook":
        return {
          text: "text-indigo-400",
          ring: "ring-indigo-400/20",
          glow: "from-indigo-500/20",
          tile: "border-indigo-400/20 bg-indigo-400/10",
          dot: "bg-indigo-400",
        };
      case "LinkedIn":
        return {
          text: "text-sky-400",
          ring: "ring-sky-400/20",
          glow: "from-sky-500/20",
          tile: "border-sky-400/20 bg-sky-400/10",
          dot: "bg-sky-400",
        };
      case "Instagram":
        return {
          text: "text-pink-400",
          ring: "ring-pink-400/20",
          glow: "from-pink-500/20",
          tile: "border-pink-400/20 bg-pink-400/10",
          dot: "bg-pink-400",
        };
      case "Threads":
        return {
          text: "text-slate-100",
          ring: "ring-white/20",
          glow: "from-white/15",
          tile: "border-white/20 bg-white/10",
          dot: "bg-slate-100",
        };
      default:
        return {
          text: "text-slate-400",
          ring: "ring-white/10",
          glow: "from-white/5",
          tile: "border-white/10 bg-white/5",
          dot: "bg-slate-500",
        };
    }
  };

  const progressPct = Math.round((connectedCount / platforms.length) * 100);

  return (
    <div className="rise-in mx-auto max-w-6xl px-6 py-10">
      {/* Hero header */}
      <header className="glass relative mb-10 overflow-hidden rounded-3xl p-8 sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-500/25 via-sky-500/15 to-transparent blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-gradient-to-tr from-rose-500/20 to-transparent blur-3xl"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Integrations hub
          </span>

          <h1 className="balance mt-4 text-4xl font-bold text-white sm:text-5xl">
            Connect Social Accounts
          </h1>

          <p className="pretty mt-3 max-w-xl text-slate-400">
            Connect your social media accounts to publish posts from one place.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-1.5 text-sm font-medium text-emerald-300">
              <span className="tabular">{connectedCount}</span> connected
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-slate-300">
              <span className="tabular">{platforms.length}</span> platforms
            </span>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-700">
          Connection failed: {errorMsg}
        </div>
      )}

      <div className="stagger grid gap-5 md:grid-cols-2">
        {platforms.map((platform, index) => {
          const accent = accentFor(platform.name);
          const { Icon } = platform;
          return (
            <div
              key={platform.name}
              style={{ "--i": index }}
              className={`glass glass-hover group relative overflow-hidden rounded-2xl p-6 ${
                platform.connected ? `ring-1 ${accent.ring}` : ""
              }`}
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${accent.glow} to-transparent blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${
                  platform.connected ? "opacity-100" : ""
                }`}
              />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-xl border text-3xl ${accent.tile}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>

                  <div className="min-w-0">
                    <h2 className={`text-lg font-semibold ${accent.text}`}>
                      {platform.name}
                    </h2>

                    {platform.connected ? (
                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-emerald-300">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${accent.dot}`}
                        />
                        <span className="truncate">
                          Connected as {platform.account}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-slate-500">
                        Not Connected
                      </p>
                    )}
                  </div>
                </div>

                {platform.connected ? (
                  <button
                    onClick={platform.onDisconnect}
                    className="btn btn-danger shrink-0"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={platform.onConnect}
                    disabled={!platform.onConnect}
                    className="btn btn-primary shrink-0"
                  >
                    Connect
                  </button>
                )}
              </div>

              {platform.isLinkedIn && platform.connected && (
                <div className="relative mt-5 border-t border-white/10 pt-5">
                  {loadingProfile && !profile ? (
                    <p className="text-sm text-slate-500">
                      Loading LinkedIn profile…
                    </p>
                  ) : profile ? (
                    <div className="flex items-center gap-4">
                      {profile.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.picture}
                          alt={profile.name}
                          className="app-img h-12 w-12 rounded-full object-cover ring-2 ring-white/10"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-slate-300">
                          {profile.name?.[0] ?? "?"}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {profile.name}
                        </p>
                        {profile.email && (
                          <p className="inline-flex items-center gap-1 truncate text-sm text-slate-400">
                            {profile.email}
                            {profile.email_verified ? (
                              <FiCheck className="h-4 w-4" />
                            ) : (
                              ""
                            )}
                          </p>
                        )}
                        <p className="truncate text-xs text-slate-500">
                          ID: {profile.sub}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {platform.isFacebook && platform.connected && (
                <div className="relative mt-5 border-t border-white/10 pt-5">
                  {fbLoading && fbPages.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Loading Facebook Pages…
                    </p>
                  ) : fbError ? (
                    <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
                      {fbError}
                    </p>
                  ) : fbPages.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Pages you manage
                      </p>
                      <p className="text-xs text-slate-500">
                        Tick the Pages to use in the app. Leave all unticked to
                        show every Page.
                      </p>
                      {fbPages.map((page) => (
                        <label
                          key={page.id}
                          className="flex cursor-pointer items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition hover:border-white/10 hover:bg-white/[0.06]"
                        >
                          <input
                            type="checkbox"
                            checked={enabledPageIds.includes(page.id)}
                            onChange={() => togglePageEnabled(page.id)}
                            className="h-4 w-4 flex-shrink-0 accent-indigo-400"
                            title="Show this Page in the app"
                          />
                          {page.picture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={page.picture}
                              alt={page.name}
                              className="app-img h-12 w-12 rounded-full object-cover ring-2 ring-white/10"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-slate-300">
                              {page.name?.[0] ?? "?"}
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">
                              {page.name}
                            </p>
                            {page.category && (
                              <p className="truncate text-sm text-slate-400">
                                {page.category}
                              </p>
                            )}
                            <p className="truncate text-xs text-slate-500">
                              ID: {page.id}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No Pages found for this account.
                    </p>
                  )}
                </div>
              )}

              {platform.isYouTube && platform.connected && (
                <div className="relative mt-5 border-t border-white/10 pt-5">
                  {ytLoading && !ytChannel ? (
                    <p className="text-sm text-slate-500">
                      Loading YouTube channel…
                    </p>
                  ) : ytError ? (
                    <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
                      {ytError} — try reconnecting (Google tokens expire after
                      about an hour).
                    </p>
                  ) : ytChannel ? (
                    <div className="flex items-center gap-4">
                      {ytChannel.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ytChannel.thumbnail}
                          alt={ytChannel.title}
                          className="app-img h-12 w-12 rounded-full object-cover ring-2 ring-rose-400/20"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-slate-300">
                          {ytChannel.title?.[0] ?? "?"}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {ytChannel.title}
                        </p>
                        <p className="truncate text-sm text-slate-400">
                          {ytChannel.subscribers != null
                            ? `${Number(
                                ytChannel.subscribers
                              ).toLocaleString()} subscribers`
                            : ""}
                          {ytChannel.videoCount != null
                            ? ` · ${Number(
                                ytChannel.videoCount
                              ).toLocaleString()} videos`
                            : ""}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          ID: {ytChannel.id}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {platform.isInstagram && (
                <div className="relative mt-5 border-t border-white/10 pt-5">
                  {!fbToken ? (
                    <p className="text-sm text-slate-500">
                      Connect Facebook first — Instagram Business accounts are
                      accessed through their linked Facebook Page.
                    </p>
                  ) : igLoading && igAccounts.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Looking for linked Instagram accounts…
                    </p>
                  ) : igError ? (
                    <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
                      {igError}
                    </p>
                  ) : igAccounts.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Linked Instagram accounts
                      </p>
                      {igAccounts.map((acct) => (
                        <div
                          key={acct.id}
                          className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-3"
                        >
                          {acct.picture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={acct.picture}
                              alt={acct.username || acct.name}
                              className="app-img h-12 w-12 rounded-full object-cover ring-2 ring-pink-400/20"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-slate-300">
                              {(acct.username || acct.name)?.[0] ?? "?"}
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">
                              {acct.username ? `@${acct.username}` : acct.name}
                            </p>
                            <p className="truncate text-sm text-slate-400">
                              {acct.followers != null
                                ? `${Number(
                                    acct.followers
                                  ).toLocaleString()} followers`
                                : ""}
                              {acct.pageName ? ` · via ${acct.pageName}` : ""}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              ID: {acct.id}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No Instagram Business account is linked to your Facebook
                      Pages. Link one in your Facebook Page settings, then
                      reconnect.
                    </p>
                  )}
                </div>
              )}

              {platform.isThreads && !platform.connected && (
                <div className="relative mt-5 border-t border-white/10 pt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Or paste a token manually
                  </p>
                  <p className="mb-3 text-xs text-slate-500">
                    Generate one in Meta&apos;s Threads token generator
                    (developers.facebook.com → your app → Threads API → Generate
                    access token), then paste it here.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste Threads access token…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveThreadsToken(e.target.value);
                      }}
                      id="threads-token-input"
                      className="field w-full text-sm"
                    />
                    <button
                      onClick={() => {
                        const el = document.getElementById(
                          "threads-token-input"
                        );
                        if (el) saveThreadsToken(el.value);
                      }}
                      className="btn btn-primary shrink-0"
                    >
                      Save
                    </button>
                  </div>
                  {thError && (
                    <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
                      {thError}
                    </p>
                  )}
                </div>
              )}

              {platform.isThreads && platform.connected && (
                <div className="relative mt-5 border-t border-white/10 pt-5">
                  {thLoading && !thProfile ? (
                    <p className="text-sm text-slate-500">
                      Loading Threads profile…
                    </p>
                  ) : thError ? (
                    <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
                      {thError} — try reconnecting.
                    </p>
                  ) : thProfile ? (
                    <div className="flex items-center gap-4">
                      {thProfile.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thProfile.picture}
                          alt={thProfile.username || thProfile.name}
                          className="app-img h-12 w-12 rounded-full object-cover ring-2 ring-white/10"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-slate-300">
                          {(thProfile.username || thProfile.name)?.[0] ?? "?"}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {thProfile.username
                            ? `@${thProfile.username}`
                            : thProfile.name}
                        </p>
                        {thProfile.name && thProfile.username && (
                          <p className="truncate text-sm text-slate-400">
                            {thProfile.name}
                          </p>
                        )}
                        <p className="truncate text-xs text-slate-500">
                          ID: {thProfile.id}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* {token && (
        <div className="glass mt-6 rounded-2xl border-emerald-400/30 bg-emerald-400/10 p-6">
          <h3 className="mb-2 font-semibold text-emerald-300">
            LinkedIn Access Token (saved to localStorage)
          </h3>
          <p className="break-all font-mono text-xs text-emerald-300/80">
            {token}
          </p>
        </div>
      )} */}

      <div className="glass mt-6 rounded-2xl p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white">Connected Accounts</h3>
            <p className="mt-1 text-sm text-slate-400">
              <span className="tabular">{connectedCount}</span> of{" "}
              <span className="tabular">{platforms.length}</span> platforms
              connected.
            </p>
          </div>
          <span className="tabular text-2xl font-bold text-white">
            {progressPct}%
          </span>
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-500"
            style={{ width: `${(connectedCount / platforms.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
