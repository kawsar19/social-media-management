import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Post from "@/lib/models/Post";
import { getUser, postInputSchema } from "../postSchema";

// GET    /api/posts/[id]  — read one post (with its targets + publish results)
// PATCH  /api/posts/[id]  — edit a post (only draft/scheduled fields; not results)
// DELETE /api/posts/[id]  — delete a post

export async function GET(request: NextRequest, { params }: { params: any }) {
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
    return NextResponse.json({ post });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: any }) {
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

    // Editing a post that's already published/publishing would desync the stored
    // per-target results, so only drafts and scheduled posts are editable.
    if (post.status !== "draft" && post.status !== "scheduled") {
      return NextResponse.json({ error: "not_editable" }, { status: 409 });
    }

    const body = await request.json().catch(() => null);
    const parsed = postInputSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    if (data.content !== undefined) post.content = data.content;
    if (data.mediaUrl !== undefined) post.mediaUrl = data.mediaUrl;
    if (data.mediaType !== undefined) post.mediaType = data.mediaType;
    if (data.youtubeTitle !== undefined) post.youtubeTitle = data.youtubeTitle;
    if (data.youtubePrivacy !== undefined) post.youtubePrivacy = data.youtubePrivacy;
    if (data.status !== undefined) post.status = data.status;
    // null means "clear it" — a queued post being pulled back to a draft.
    if (data.scheduledAt !== undefined) {
      post.scheduledAt = data.scheduledAt ?? undefined;
    }
    if (data.targets !== undefined) {
      post.targets = data.targets.map((t) => ({ ...t, status: "pending" as const }));
    }

    await post.save();
    return NextResponse.json({ post });
  } catch {
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
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
