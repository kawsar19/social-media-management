import { NextResponse } from "next/server";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// The image that gets generated from this prompt is published alongside the
// post, so the prompt must describe a scene rather than restate the caption —
// an image full of rendered words is the usual failure here.
const SYSTEM_PROMPT = `You turn a social media post into a short prompt for an AI image generator.

Rules:
- Output ONE prompt describing a single, concrete visual scene that suits the post.
- Describe subject, setting, composition, and lighting. Be specific and visual.
- Never ask for text, words, letters, numbers, logos, or watermarks in the image.
- Do not restate or quote the post's caption. The image illustrates the post; it does not repeat it.
- Never invent brand names, real people, or specific products the post doesn't mention.
- Keep it under 60 words.
- Output ONLY the prompt text. No preamble, no explanation, no quotes, no options.`;

// Pulls the assistant's text out of an Interactions response: the last
// model_output step's text content blocks, joined. Same shape as the other AI
// routes.
function extractText(data) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const outputs = steps.filter((s) => s.type === "model_output");
  const last = outputs.at(-1);
  const parts = Array.isArray(last?.content) ? last.content : [];
  return parts
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("")
    .trim();
}

// Strips wrapping the model sometimes adds despite the system prompt.
function cleanOutput(text) {
  let out = text.trim();
  const fenced = out.match(/^```(?:\w+)?\n([\s\S]*?)\n?```$/);
  if (fenced) out = fenced[1].trim();
  if (out.length > 1 && /^["'“](.*)["'”]$/s.test(out)) {
    out = out.replace(/^["'“]/, "").replace(/["'”]$/, "").trim();
  }
  return out;
}

// POST /api/ai/image-prompt  { text }
// Suggests an image-generation prompt from the composer's post text.
// Returns { prompt }.
export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI isn't configured — set GEMINI_API_KEY." },
      { status: 501 }
    );
  }

  const body = await request.json().catch(() => null);
  const text = body?.text?.toString().trim() ?? "";

  if (!text) {
    return NextResponse.json(
      { error: "Write your post first, then I can suggest an image." },
      { status: 400 }
    );
  }
  if (text.length > 8000) {
    return NextResponse.json(
      { error: "That post is too long to read." },
      { status: 400 }
    );
  }

  let res;
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        system_instruction: SYSTEM_PROMPT,
        input: `Here is the post:\n"""\n${text}\n"""\n\nWrite the image prompt.`,
        // Some variety so regenerating gives a different scene, but not so much
        // that the prompt drifts away from the post.
        generation_config: { temperature: 0.8 },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return NextResponse.json(
      { error: "AI service timed out. Try again." },
      { status: 504 }
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.message || "Couldn't suggest a prompt." },
      { status: res.status }
    );
  }

  const out = cleanOutput(extractText(data));
  if (!out) {
    return NextResponse.json(
      { error: "The AI returned nothing. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ prompt: out });
}
