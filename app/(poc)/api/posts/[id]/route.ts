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

export async function GET(request: NextRequest, { params }: { params: any }) {
  try {
    await connectDB();

    const { id } = await params;
    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const post = await Post.findOne({ _id: id, userId: user.userId }).populate("accountId", "platform platformName");
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: any }) {
  try {
    await connectDB();

    const { id } = await params;
    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const post = await Post.findOne({ _id: id, userId: user.userId });
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = postSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    Object.assign(post, parsed.data);
    await post.save();

    const populated = await Post.findById(post._id).populate("accountId", "platform platformName");
    return NextResponse.json({ post: populated });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: any }) {
  try {
    await connectDB();

    const { id } = await params;
    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const post = await Post.findOneAndDelete({ _id: id, userId: user.userId });
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
