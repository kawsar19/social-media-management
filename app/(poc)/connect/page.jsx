"use client";

import { useEffect, useState } from "react";

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
  "public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,business_management";
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

  // On mount: restore a previously saved Facebook token.
  useEffect(() => {
    setFbToken(localStorage.getItem(FB_STORAGE_KEY));
  }, []);

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

  function connectFacebook() {
    window.location.href = buildFacebookAuthUrl();
  }

  function disconnectFacebook() {
    localStorage.removeItem(FB_STORAGE_KEY);
    setFbToken(null);
    setFbPages([]);
    setFbError(null);
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
      icon: "💼",
      isLinkedIn: true,
      connected: Boolean(token),
      account: profile?.name || "LinkedIn Account",
      onConnect: connectLinkedIn,
      onDisconnect: disconnectLinkedIn,
    },
    {
      name: "Facebook",
      icon: "📘",
      isFacebook: true,
      connected: Boolean(fbToken),
      account:
        fbPages.length > 0
          ? fbPages.map((p) => p.name).join(", ")
          : "Facebook Account",
      onConnect: connectFacebook,
      onDisconnect: disconnectFacebook,
    },
    { name: "Instagram", icon: "📷", connected: false },
    { name: "X", icon: "✖️", connected: false },
    { name: "TikTok", icon: "🎵", connected: false },
  ];

  const connectedCount = platforms.filter((p) => p.connected).length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900">
            Connect Social Accounts
          </h1>

          <p className="mt-2 text-slate-500">
            Connect your social media accounts to publish posts from one place.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Connection failed: {errorMsg}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {platforms.map((platform) => (
            <div
              key={platform.name}
              className="rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-3xl">
                    {platform.icon}
                  </div>

                  <div>
                    <h2 className="font-semibold text-lg">{platform.name}</h2>

                    {platform.connected ? (
                      <p className="text-sm text-green-600">
                        Connected as {platform.account}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500">Not Connected</p>
                    )}
                  </div>
                </div>

                {platform.connected ? (
                  <button
                    onClick={platform.onDisconnect}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={platform.onConnect}
                    disabled={!platform.onConnect}
                    className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    Connect
                  </button>
                )}
              </div>

              {platform.isLinkedIn && platform.connected && (
                <div className="mt-5 border-t pt-5">
                  {loadingProfile && !profile ? (
                    <p className="text-sm text-slate-400">
                      Loading LinkedIn profile…
                    </p>
                  ) : profile ? (
                    <div className="flex items-center gap-4">
                      {profile.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.picture}
                          alt={profile.name}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
                          {profile.name?.[0] ?? "?"}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {profile.name}
                        </p>
                        {profile.email && (
                          <p className="truncate text-sm text-slate-500">
                            {profile.email}
                            {profile.email_verified ? " ✓" : ""}
                          </p>
                        )}
                        <p className="truncate text-xs text-slate-400">
                          ID: {profile.sub}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {platform.isFacebook && platform.connected && (
                <div className="mt-5 border-t pt-5">
                  {fbLoading && fbPages.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      Loading Facebook Pages…
                    </p>
                  ) : fbError ? (
                    <p className="text-sm text-red-600">{fbError}</p>
                  ) : fbPages.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Pages you manage
                      </p>
                      {fbPages.map((page) => (
                        <div key={page.id} className="flex items-center gap-4">
                          {page.picture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={page.picture}
                              alt={page.name}
                              className="h-12 w-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
                              {page.name?.[0] ?? "?"}
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">
                              {page.name}
                            </p>
                            {page.category && (
                              <p className="truncate text-sm text-slate-500">
                                {page.category}
                              </p>
                            )}
                            <p className="truncate text-xs text-slate-400">
                              ID: {page.id}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      No Pages found for this account.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {token && (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-6">
            <h3 className="mb-2 font-semibold text-green-800">
              LinkedIn Access Token (saved to localStorage)
            </h3>
            <p className="break-all font-mono text-xs text-green-700">
              {token}
            </p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border bg-white p-6">
          <h3 className="mb-2 font-semibold">Connected Accounts</h3>

          <p className="text-sm text-slate-500">
            {connectedCount} of {platforms.length} platforms connected.
          </p>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${(connectedCount / platforms.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
  );
}
