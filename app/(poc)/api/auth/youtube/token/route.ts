import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/db";
import SocialAccount from "@/lib/models/SocialAccount";

// GET /api/auth/youtube/token
// Auth: Bearer <app JWT> (from AuthProvider, NOT a platform token).
//
// Returns a *valid* YouTube access token for the logged-in user, refreshing it
// server-side when it has expired (Google access tokens last ~1 hour). This is
// what lets the app keep calling the YouTube API without the user reconnecting
// every hour — as long as a refresh_token was stored at connect time.
//
// Response: { accessToken, expiresAt } or { error } with an HTTP status.

// Refresh a bit early so a token that's about to expire mid-request is renewed.
const EXPIRY_SKEW_MS = 60 * 1000;

function getUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId") || undefined;

    const query: Record<string, unknown> = { userId: user.userId, platform: "youtube" };
    if (accountId) query._id = accountId;

    const account = await SocialAccount.findOne(query);
    if (!account) {
      return NextResponse.json({ error: "not_connected" }, { status: 404 });
    }

    const now = Date.now();
    const expiresAtMs = account.expiresAt
      ? new Date(account.expiresAt).getTime()
      : 0;
    const stillValid = expiresAtMs - EXPIRY_SKEW_MS > now;

    if (stillValid) {
      return NextResponse.json({
        accessToken: account.accessToken,
        expiresAt: account.expiresAt,
      });
    }

    // Expired (or about to). Refresh via the stored refresh_token.
    if (!account.refreshToken) {
      // No refresh token on file — the user connected before we started
      // requesting one, or Google didn't return it. They must reconnect.
      return NextResponse.json(
        { error: "reauth_required" },
        { status: 401 }
      );
    }

    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await refreshRes.json();

    if (!refreshRes.ok || !data.access_token) {
      // A revoked/expired refresh token means the user must reconnect.
      return NextResponse.json(
        { error: data.error_description || data.error || "refresh_failed" },
        { status: 401 }
      );
    }

    const newExpiresAt = new Date(now + (data.expires_in ?? 3600) * 1000);
    account.accessToken = data.access_token;
    account.expiresAt = newExpiresAt;
    // Google usually omits refresh_token on refresh; keep the existing one.
    if (data.refresh_token) account.refreshToken = data.refresh_token;
    await account.save();

    return NextResponse.json({
      accessToken: account.accessToken,
      expiresAt: newExpiresAt,
    });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
