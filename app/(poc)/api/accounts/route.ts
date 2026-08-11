import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import SocialAccount from "@/lib/models/SocialAccount";
import jwt from "jsonwebtoken";
import { z } from "zod";

const accountSchema = z.object({
  platform: z.enum(["linkedin", "facebook", "youtube", "instagram", "threads"]),
  platformId: z.string(),
  platformName: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
  scope: z.string().optional(),
});

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

    const accounts = await SocialAccount.find({ userId: user.userId }).sort({ platform: 1 });
    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = accountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { platform, platformId, platformName, accessToken, refreshToken, expiresAt, scope } = parsed.data;

    // Only overwrite the optional fields when they're actually provided. A
    // re-save without a refreshToken (e.g. the connect page rehydrating an
    // already-connected YouTube account) must NOT wipe the stored refresh
    // token that server-side auto-refresh depends on.
    const update: Record<string, unknown> = {
      platformId,
      platformName,
      accessToken,
      connectedAt: new Date(),
    };
    if (refreshToken !== undefined) update.refreshToken = refreshToken;
    if (expiresAt !== undefined) update.expiresAt = expiresAt;
    if (scope !== undefined) update.scope = scope;

    const account = await SocialAccount.findOneAndUpdate(
      { userId: user.userId, platform, platformId },
      update,
      { new: true, upsert: true }
    );

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    // A duplicate-key error here means a unique index is rejecting the insert
    // (e.g. a stale { userId, platform } index left over from before
    // multi-account support). Surfacing it beats a bare 500 that reads as an
    // unexplained "failed to save".
    if ((error as { code?: number })?.code === 11000) {
      console.error("[accounts] duplicate key:", error);
      return NextResponse.json({ error: "duplicate_account" }, { status: 409 });
    }
    console.error("[accounts] save failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    const account = await SocialAccount.findOne({ _id: id, userId: user.userId });
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    await account.deleteOne();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}