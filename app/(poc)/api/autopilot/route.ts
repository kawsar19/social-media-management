import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import AutoPost from "@/lib/models/AutoPost";
import { getUser } from "../posts/postSchema";
import { isValidTimezone, parseTimeOfDay } from "@/lib/autopost/schedule";

// /api/autopilot — the standing "write and publish this every day" automations.
// Auth: Bearer <app JWT>, same as the rest of the poc API.
//
// The cron (/api/cron) is what runs these; these routes only manage them.

const targetSchema = z.object({
  platform: z.enum(["linkedin", "facebook", "instagram", "threads", "youtube"]),
  accountId: z.string().optional(),
  accountName: z.string().optional(),
  destinationId: z.string().optional(),
  destinationName: z.string().optional(),
});

export const autoPostInputSchema = z.object({
  name: z.string().trim().min(1).max(120).default("Untitled automation"),
  prompt: z.string().trim().min(1, "Describe what the post should say.").max(4000),

  language: z.enum(["english", "bangla", "banglish"]).default("english"),
  tone: z
    .enum(["professional", "casual", "friendly", "excited", "informative", "funny"])
    .default("professional"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  hashtags: z.boolean().default(true),
  emojis: z.boolean().default(true),

  // At least one, or the automation would generate a post with nowhere to go.
  targets: z.array(targetSchema).min(1, "Pick at least one destination."),

  frequency: z.enum(["daily", "weekly"]).default("daily"),
  // Validated against the same parser the cron uses, so anything stored here is
  // guaranteed to be readable at run time.
  timeOfDay: z
    .string()
    .refine((v) => parseTimeOfDay(v) !== null, "Use a time like 09:00."),
  // An unknown zone would throw inside the cron and take down every other
  // automation in the same tick, so it's rejected on the way in.
  timezone: z.string().refine(isValidTimezone, "Unknown timezone."),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),

  enabled: z.boolean().default(true),
});

// A weekly automation with no days selected can never fire — better to reject it
// than to save something that silently does nothing.
function checkWeekly(data: z.infer<typeof autoPostInputSchema>) {
  return data.frequency === "weekly" && data.daysOfWeek.length === 0
    ? "Pick at least one day of the week."
    : null;
}

// GET /api/autopilot — every automation for the signed-in user.
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const autoPosts = await AutoPost.find({ userId: user.userId }).sort({ createdAt: -1 });
    return NextResponse.json({ autoPosts });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// POST /api/autopilot — create one.
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const parsed = autoPostInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid automation." },
        { status: 400 }
      );
    }

    const weeklyError = checkWeekly(parsed.data);
    if (weeklyError) return NextResponse.json({ error: weeklyError }, { status: 400 });

    const autoPost = await AutoPost.create({
      ...parsed.data,
      userId: new mongoose.Types.ObjectId(user.userId),
      targets: parsed.data.targets.map((t) => ({
        ...t,
        accountId: t.accountId ? new mongoose.Types.ObjectId(t.accountId) : undefined,
      })),
    });

    return NextResponse.json({ autoPost }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
