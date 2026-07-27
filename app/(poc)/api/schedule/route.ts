import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Schedule from "@/lib/models/Schedule";
import Post from "@/lib/models/Post";
import jwt from "jsonwebtoken";
import { z } from "zod";

const scheduleSchema = z.object({
  postId: z.string(),
  accountIds: z.array(z.string()),
  scheduledAt: z.coerce.date(),
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

    const schedules = await Schedule.find({ userId: user.userId })
      .sort({ scheduledAt: 1 })
      .populate("postId", "content status platform");
    return NextResponse.json({ schedules });
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
    const parsed = scheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { postId, accountIds, scheduledAt } = parsed.data;

    const schedule = await Schedule.create({
      userId: user.userId,
      postId: new mongoose.Types.ObjectId(postId),
      accountIds: accountIds.map((id) => new mongoose.Types.ObjectId(id)),
      scheduledAt,
      status: "pending",
    });

    const post = await Post.findById(postId);
    if (post) {
      post.status = "scheduled";
      post.scheduledAt = scheduledAt;
      await post.save();
    }

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}