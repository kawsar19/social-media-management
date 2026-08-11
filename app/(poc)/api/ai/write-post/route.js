import { NextResponse } from "next/server";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Output language. `key` is what the client sends; `instruction` is folded into
// the system prompt. Mirrors /api/ai/rewrite so both AI features offer the same
// set of languages.
const LANGUAGES = {
  english: {
    label: "English",
    instruction: "Write the post in clear, natural, correctly-spelled English.",
  },
  bangla: {
    label: "Bangla",
    instruction:
      "Write the post in natural, fluent Bengali using Bengali script. If the user's brief is written in Banglish (Bengali typed with English letters), interpret the intended Bengali meaning rather than transliterating word by word.",
  },
  banglish: {
    label: "Banglish",
    instruction:
      "Write the post in Bengali expressed with English letters (Banglish), the way Bengali speakers casually type. Do not use Bengali script.",
  },
};

const TONES = {
  professional: "Professional and credible, the way a company account writes.",
  casual: "Casual and conversational, like talking to a friend.",
  friendly: "Warm and friendly, approachable without being sloppy.",
  excited: "Energetic and enthusiastic, but not shouty — no wall of exclamation marks.",
  informative: "Plain and informative. Facts first, no hype.",
  funny: "Light and playful, with a bit of humour. Never at anyone's expense.",
};

const LENGTHS = {
  short: "Keep it to 1–2 short sentences. Under 200 characters.",
  medium: "Keep it to about 3–5 sentences, one or two short paragraphs.",
  long: "Write a longer post: 2–4 short paragraphs with a clear opening hook and a closing line.",
};

// Platform-specific writing conventions. Only the selected platforms' notes are
// sent, so a LinkedIn-only post isn't shaped by Instagram's rules.
const PLATFORM_NOTES = {
  linkedin:
    "LinkedIn: professional audience. Open with a hook line, keep paragraphs short and scannable, no more than 3 hashtags at the end.",
  facebook:
    "Facebook: general audience. Conversational, a question or call to action works well. Few or no hashtags.",
  instagram:
    "Instagram: caption for an image or video. Punchy first line, emoji are welcome, 3–8 relevant hashtags at the end.",
  threads:
    "Threads: short and conversational, like a text message. Under 500 characters, hashtags used sparingly.",
  youtube:
    "YouTube: a video description. Say what the video covers, then any relevant links or timestamps placeholders.",
};

// The post is written for a real business account and published as-is, so the
// model must not invent verifiable specifics — a made-up price or launch date
// would go out publicly under the user's name.
const SYSTEM_PROMPT = `You write social media posts for a business account, from a short brief the user gives you.

Rules:
- Write ONE post based on the brief. Do not offer alternatives, variations, or options.
- Never invent facts the brief doesn't give you: no prices, dates, statistics, product names, discounts, URLs, or claims. If the brief is vague, stay general rather than filling in specifics.
- Never use placeholder text like [Company Name], [link], or XX% — write around anything you weren't told.
- Preserve any names, numbers, links, and details the brief does give you, exactly as written.
- Output ONLY the post text, ready to publish. No preamble, no explanation, no "Here's your post:", no surrounding quotes, no title or subject line.
- Do not add a sign-off or signature.`;

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

// Strips wrapping the model sometimes adds despite the system prompt: a fenced
// code block, or the whole post in matching quotes.
function cleanOutput(text) {
  let out = text.trim();
  const fenced = out.match(/^```(?:\w+)?\n([\s\S]*?)\n?```$/);
  if (fenced) out = fenced[1].trim();
  if (out.length > 1 && /^["'“](.*)["'”]$/s.test(out)) {
    out = out.replace(/^["'“]/, "").replace(/["'”]$/, "").trim();
  }
  return out;
}

// POST /api/ai/write-post
//   { prompt, language?, tone?, length?, platforms?: string[], hashtags?: bool,
//     emojis?: bool, current? }
// Writes a ready-to-publish social post from a short brief. `current` is the
// composer's existing text — when present the model revises it against the
// brief instead of starting over. Returns { text }.
export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI writing isn't configured — set GEMINI_API_KEY." },
      { status: 501 }
    );
  }

  const body = await request.json().catch(() => null);
  const prompt = body?.prompt?.toString().trim() ?? "";
  const current = body?.current?.toString().trim() ?? "";

  if (!prompt) {
    return NextResponse.json({ error: "Describe what the post should say." }, { status: 400 });
  }
  // A brief is a couple of sentences; anything this long is a paste accident and
  // would be slow and expensive for no benefit.
  if (prompt.length > 4000) {
    return NextResponse.json({ error: "That brief is too long." }, { status: 400 });
  }
  if (current.length > 8000) {
    return NextResponse.json({ error: "The existing post is too long to revise." }, { status: 400 });
  }

  const lang = LANGUAGES[body?.language] || LANGUAGES.english;
  const tone = TONES[body?.tone] || TONES.professional;
  const length = LENGTHS[body?.length] || LENGTHS.medium;

  const platforms = Array.isArray(body?.platforms)
    ? body.platforms.filter((p) => PLATFORM_NOTES[p])
    : [];

  // Assemble the system prompt from the chosen options. Each line is a
  // constraint the model applies on top of the base rules.
  const directives = [
    `Language: ${lang.label}. ${lang.instruction}`,
    `Tone: ${tone}`,
    `Length: ${length}`,
  ];

  if (platforms.length > 0) {
    directives.push(
      platforms.length === 1
        ? `This post is for ${platforms[0]}. ${PLATFORM_NOTES[platforms[0]]}`
        : `This same post will be published to several platforms at once (${platforms.join(
            ", "
          )}), so it must read well on all of them. Their conventions:\n${platforms
            .map((p) => `- ${PLATFORM_NOTES[p]}`)
            .join("\n")}`
    );
  }

  directives.push(
    body?.hashtags === false
      ? "Do not use any hashtags."
      : "Hashtags are allowed where they fit the platform, at the end of the post."
  );
  directives.push(
    body?.emojis === false
      ? "Do not use any emoji."
      : "A few tasteful emoji are allowed where they fit the tone."
  );

  // Revise mode: the composer already has text, so the brief is an instruction
  // about that text rather than a description of a post to write from scratch.
  const input = current
    ? `Here is the current draft of the post:\n"""\n${current}\n"""\n\nRewrite it according to this instruction:\n"""\n${prompt}\n"""\n\nOutput only the revised post.`
    : `Write the post from this brief:\n"""\n${prompt}\n"""`;

  if (current) {
    directives.push(
      "You are revising an existing draft. Keep everything the instruction doesn't ask you to change, including any facts, names, links, and numbers already in it."
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
        system_instruction: `${SYSTEM_PROMPT}\n\n${directives.join("\n")}`,
        input,
        // Higher than the rewrite route's 0.3: this is a writing task, and a
        // deterministic post reads flat.
        generation_config: { temperature: 0.9 },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return NextResponse.json({ error: "AI service timed out. Try again." }, { status: 504 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.message || "Couldn't write the post." },
      { status: res.status }
    );
  }

  const out = cleanOutput(extractText(data));
  if (!out) {
    // A safety block or an empty completion. Saying nothing came back is more
    // useful than handing back an empty composer.
    return NextResponse.json(
      { error: "The AI returned nothing. Try rephrasing your brief." },
      { status: 502 }
    );
  }

  return NextResponse.json({ text: out });
}
