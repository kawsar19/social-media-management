"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useAuth } from "./AuthProvider";

const GSI_SRC = "https://accounts.google.com/gsi/client";

// Google Sign-In, rendered two ways at once:
//
//  1. One Tap — the floating "Sign in to <site> with google.com" card that
//     appears top-right on its own when the visitor is already signed into
//     Google in this browser. This is the prompt users recognise from news
//     sites. It is best-effort: Google suppresses it if the user has no Google
//     session, dismissed it recently, or blocks third-party cookies.
//  2. A rendered "Sign in with Google" button — always visible, so the flow
//     still works when One Tap is suppressed.
//
// Both paths call back into the same `handleCredential`.
export default function GoogleAuth({ redirect = "/post", onError }) {
  const { loginWithGoogle } = useAuth();
  const buttonRef = useRef(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredential = useCallback(
    async (response) => {
      if (!response?.credential) return;
      setBusy(true);
      try {
        await loginWithGoogle(response.credential);
        window.location.href = redirect;
      } catch (err) {
        setBusy(false);
        onError?.(err.message);
      }
    },
    [loginWithGoogle, redirect, onError]
  );

  useEffect(() => {
    if (!scriptLoaded || !clientId) return;
    const google = window.google;
    if (!google?.accounts?.id) return;

    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredential,
      // Skips the account-chooser step when the user has exactly one Google
      // session — the one-click experience One Tap is known for.
      auto_select: false,
      cancel_on_tap_outside: false,
    });

    if (buttonRef.current) {
      google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "center",
        width: 320,
      });
    }

    // Fire the floating prompt. Silently ignored by Google when not eligible.
    google.accounts.id.prompt();

    return () => {
      google.accounts.id.cancel();
    };
  }, [scriptLoaded, clientId, handleCredential]);

  if (!clientId) return null;

  return (
    <>
      <Script
        src={GSI_SRC}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => onError?.("google_script_failed")}
      />

      <div className="flex flex-col items-center gap-3">
        {/* Google injects its own iframe button here; it renders in Google's
            styling, which we are not allowed to restyle. */}
        <div
          ref={buttonRef}
          className={`flex min-h-[40px] w-full justify-center ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        />

        {!scriptLoaded && (
          <div className="h-10 w-full animate-pulse rounded-full bg-white/[0.06]" />
        )}

        {busy && (
          <p className="text-xs text-slate-400">Signing you in&hellip;</p>
        )}
      </div>
    </>
  );
}
