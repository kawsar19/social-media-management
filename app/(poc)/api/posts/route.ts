import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Post from "@/lib/models/Post";
import { getUser, postInputSchema } from "./postSchema";

// GET  /api/posts?status=draft   — list the logged-in user's posts (newest first)
// POST /api/posts                — create a draft/scheduled post with its targets
//
// A post is authored once and carries its target list (where it will be
// published). Actual publishing + per-target results happen in
// /api/posts/[id]/publish; this route only stores the authored content.

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;

    const filter: Record<string, unknown> = { userId: user.userId };
    if (status) filter.status = status;

    const posts = await Post.find(filter).sort({ createdAt: -1 });
    return NextResponse.json({ posts });
  } catch {
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
    const parsed = postInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const {
      content,
      mediaUrl,
      mediaType,
      youtubeTitle,
      youtubePrivacy,
      status,
      scheduledAt,
      targets,
    } = parsed.data;

    // A post needs either some text or media to be worth saving.
    if (!content.trim() && !mediaUrl) {
      return NextResponse.json({ error: "empty_post" }, { status: 400 });
    }

    const post = await Post.create({
      userId: new mongoose.Types.ObjectId(user.userId),
      content,
      mediaUrl,
      mediaType,
      youtubeTitle,
      youtubePrivacy,
      status: status || "draft",
      scheduledAt,
      // Each target starts pending until the publish route runs it.
      targets: targets.map((t) => ({ ...t, status: "pending" as const })),
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
