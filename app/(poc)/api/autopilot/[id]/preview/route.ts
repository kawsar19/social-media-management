import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AutoPost from "@/lib/models/AutoPost";
import { writePost, WritePostError } from "@/lib/ai/writePost";
import { getUser } from "../../../posts/postSchema";

// POST /api/autopilot/[id]/preview
// Auth: Bearer <app JWT>.
//
// Generates a post from the automation's prompt and returns the text WITHOUT
// publishing it. This is how you find out what a standing prompt actually
// produces before it starts going out unattended — otherwise the first real
// output is also the first one the public sees.
//
// Deliberately does not touch lastRunKey or runs: a preview is not a run, and
// must not consume the day's occurrence.

// One AI call. Well under the platform default, but stated so a slow model
// response doesn't hit an unrelated shorter limit.
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: any }) {
  try {
    await connectDB();
    const { id } = await params;
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const auto = await AutoPost.findOne({ _id: id, userId: user.userId });
    if (!auto) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const text = await writePost(auto.prompt, {
      language: auto.language,
      tone: auto.tone,
      length: auto.length,
      platforms: [...new Set(auto.targets.map((t: any) => t.platform))] as string[],
      hashtags: auto.hashtags,
      emojis: auto.emojis,
      // Matches what the cron sends, so the preview reflects the real output
      // rather than a slightly different, better-behaved version of it.
      unattended: true,
    });

    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof WritePostError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
