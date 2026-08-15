import { NextResponse } from "next/server";
import { writePost, WritePostError } from "@/lib/ai/writePost";

// POST /api/ai/write-post
//   { prompt, language?, tone?, length?, platforms?: string[], hashtags?: bool,
//     emojis?: bool, current? }
// Writes a ready-to-publish social post from a short brief. `current` is the
// composer's existing text — when present the model revises it against the
// brief instead of starting over. Returns { text }.
//
// The generation itself lives in lib/ai/writePost so the cron (/api/cron) can
// produce posts the same way without going through HTTP.
export async function POST(request) {
  const body = await request.json().catch(() => null);

  try {
    const text = await writePost(body?.prompt?.toString() ?? "", {
      language: body?.language,
      tone: body?.tone,
      length: body?.length,
      platforms: body?.platforms,
      hashtags: body?.hashtags,
      emojis: body?.emojis,
      current: body?.current?.toString() ?? "",
    });
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof WritePostError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Couldn't write the post." }, { status: 500 });
  }
}
