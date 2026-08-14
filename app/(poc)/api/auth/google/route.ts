import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { generateToken } from "@/lib/auth";

// Google Sign-In / One Tap.
//
// The browser gets an ID token (a JWT) straight from Google and POSTs it here
// as { credential }. We verify that JWT against Google's public keys — this is
// what makes it trustworthy, never trust the email inside it unverified — then
// look the user up by email and hand back our own app JWT, exactly like
// /api/auth/login does. Nothing downstream needs to know the user came from
// Google.
//
// Unlike the YouTube OAuth flow this needs no client secret and no redirect
// URI: the token never leaves the browser->our-server hop. What it does need
// is the app's origin registered as an "Authorized JavaScript origin" on the
// same Google Cloud OAuth client.

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return NextResponse.json({ error: "google_not_configured" }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const credential = body?.credential;
    if (typeof credential !== "string" || credential.length === 0) {
      return NextResponse.json({ error: "missing_credential" }, { status: 400 });
    }

    // Verifies signature, expiry, issuer, and that the token was minted for
    // OUR client id. Throws on anything that does not check out.
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
    }

    if (!payload?.email || !payload.sub) {
      return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
    }

    // Google tells us whether it has actually verified the address. An
    // unverified one could be attacker-controlled, so it must not be allowed
    // to match an existing account.
    if (!payload.email_verified) {
      return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
    }

    await connectDB();

    const email = payload.email.toLowerCase();
    const name = payload.name?.trim() || email.split("@")[0];

    let user = await User.findOne({ email });

    if (user) {
      // Existing account — link it to Google on first Google sign-in and keep
      // the profile picture fresh. An account originally created with a
      // password keeps provider "credentials" so it can still log in that way.
      let dirty = false;
      if (!user.googleId) {
        user.googleId = payload.sub;
        dirty = true;
      }
      if (payload.picture && user.avatar !== payload.picture) {
        user.avatar = payload.picture;
        dirty = true;
      }
      if (dirty) await user.save();
    } else {
      user = await User.create({
        email,
        name,
        provider: "google",
        googleId: payload.sub,
        avatar: payload.picture,
      });
    }

    const token = generateToken(user._id.toString());

    return NextResponse.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
