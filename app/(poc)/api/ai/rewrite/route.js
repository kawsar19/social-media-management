import { NextResponse } from "next/server";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// The languages a draft can be rewritten into. `key` is what the client sends;
// `instruction` is folded into the system prompt.
const LANGUAGES = {
  bangla: {
    label: "Bangla",
    instruction:
      "Rewrite it in natural, fluent Bengali using Bengali script. If the input is written in Banglish (Bengali typed with English letters), interpret the intended Bengali meaning rather than transliterating word by word.",
  },
  english: {
    label: "English",
    instruction: "Rewrite it in clear, natural, correctly-spelled English.",
  },
  banglish: {
    label: "Banglish",
    instruction:
      "Rewrite it in Bengali expressed with English letters (Banglish), the way Bengali speakers casually type. Do not use Bengali script.",
  },
};

// Rewriting a customer-service reply must not invent facts — a hallucinated
// price or delivery promise would go out as a real message to a real person.
const SYSTEM_PROMPT = `You rewrite draft direct-message replies for a business's social media inbox.

Rules:
- Preserve the writer's meaning and intent exactly. Never add facts, promises, prices, dates, greetings, or sign-offs that are not in the draft.
- Never answer the draft or continue the conversation. You are rewriting one message, not replying to it.
- Keep it roughly the same length. A short draft stays short.
- Keep the tone polite and professional but natural — this is a chat message, not a formal letter.
- Preserve any names, numbers, links, and order IDs exactly as written.
- Output ONLY the rewritten message. No quotes, no preamble, no explanation, no alternatives.`;

// Pulls the assistant's text out of an Interactions response: the last
// model_output step's text content blocks, joined.
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

// POST /api/ai/rewrite  { text, language }
// Rewrites a rough draft into the chosen language, cleaned up. Returns
// { text } — the rewritten message, for preview before sending.
export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI rewrite isn't configured — set GEMINI_API_KEY." },
      { status: 501 }
    );
  }

  const body = await request.json().catch(() => null);
  const text = body?.text?.toString().trim() ?? "";
  const language = body?.language?.toString() ?? "";
  const lang = LANGUAGES[language];
  if (!text) {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }
  if (!lang) {
    return NextResponse.json({ error: "unsupported_language" }, { status: 400 });
  }
  // A guard against pasting something enormous into a chat composer, which
  // would be slow and expensive for no benefit.
  if (text.length > 4000) {
    return NextResponse.json({ error: "text_too_long" }, { status: 400 });
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
        system_instruction: `${SYSTEM_PROMPT}\n\nTarget language: ${lang.label}. ${lang.instruction}`,
        input: text,
        // Low temperature: this is a faithful rewrite, not a creative task.
        generation_config: { temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return NextResponse.json({ error: "AI service timed out. Try again." }, { status: 504 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.message || "rewrite_failed" },
      { status: res.status }
    );
  }

  const out = extractText(data);
  if (!out) {
    // A safety block or an empty completion — surfacing the draft unchanged
    // would look like the rewrite silently did nothing.
    return NextResponse.json({ error: "The AI returned nothing. Try rephrasing." }, { status: 502 });
  }

  return NextResponse.json({ text: out });
}
