import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Post from "@/lib/models/Post";
import jwt from "jsonwebtoken";
import { z } from "zod";

const postSchema = z.object({
  accountId: z.string(),
  content: z.string().min(1),
  mediaUrl: z.string().optional(),
  status: z.enum(["draft", "scheduled", "published", "failed"]).optional(),
  scheduledAt: z.coerce.date().optional(),
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const platform = searchParams.get("platform") || undefined;

    const filter: Record<string, unknown> = { userId: user.userId };
    if (status) filter.status = status;
    if (platform) filter.platform = platform;

    const posts = await Post.find(filter).sort({ createdAt: -1 }).populate("accountId", "platform platformName");
    return NextResponse.json({ posts });
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
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { accountId, content, mediaUrl, status, scheduledAt } = parsed.data;

    const post = await Post.create({
      userId: user.userId,
      accountId: new mongoose.Types.ObjectId(accountId),
      content,
      mediaUrl,
      status: status || "draft",
      scheduledAt,
      platform: "unknown",
    });

    const populated = await Post.findById(post._id).populate("accountId", "platform platformName");
    return NextResponse.json({ post: populated }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}