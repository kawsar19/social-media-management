// Turning a brief into a ready-to-publish post.
//
// This was originally inlined in /api/ai/write-post, where it could only be
// reached over HTTP with a signed-in user. The cron needs the same generation —
// same prompts, same options, same output cleaning — with no request in hand,
// so the logic lives here and both callers share it.
//
// Server-only: it reads GEMINI_API_KEY.

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Output language. `key` is what callers send; `instruction` is folded into the
// system prompt. Mirrors /api/ai/rewrite so both AI features offer the same set.
export const LANGUAGES: Record<string, { label: string; instruction: string }> = {
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

export const TONES: Record<string, string> = {
  professional: "Professional and credible, the way a company account writes.",
  casual: "Casual and conversational, like talking to a friend.",
  friendly: "Warm and friendly, approachable without being sloppy.",
  excited: "Energetic and enthusiastic, but not shouty — no wall of exclamation marks.",
  informative: "Plain and informative. Facts first, no hype.",
  funny: "Light and playful, with a bit of humour. Never at anyone's expense.",
};

export const LENGTHS: Record<string, string> = {
  short: "Keep it to 1–2 short sentences. Under 200 characters.",
  medium: "Keep it to about 3–5 sentences, one or two short paragraphs.",
  long: "Write a longer post: 2–4 short paragraphs with a clear opening hook and a closing line.",
};

// Platform-specific writing conventions. Only the selected platforms' notes are
// sent, so a LinkedIn-only post isn't shaped by Instagram's rules.
export const PLATFORM_NOTES: Record<string, string> = {
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

// Extra rules that only apply when nobody is going to read the post before it
// goes out. An unattended run can't be rescued by the composer's eye, so the
// model is told to keep the post self-contained and free of anything that
// implies a specific moment it can't actually know.
const UNATTENDED_PROMPT = `This post will be published automatically, with nobody reviewing it first. Be conservative:
- Do not reference today's date, the current time, the weather, the day of the week, or any current event — you cannot know them.
- Do not imply this is part of a series, or refer to a previous or next post.
- Do not address a specific named person or ask a question that needs a reply from the account owner.
- If the brief is too vague to write something genuinely useful, write something simple and general rather than inventing detail.`;

// Pulls the assistant's text out of an Interactions response: the last
// model_output step's text content blocks, joined.
function extractText(data: any): string {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const outputs = steps.filter((s: any) => s.type === "model_output");
  const last = outputs.at(-1);
  const parts = Array.isArray(last?.content) ? last.content : [];
  return parts
    .filter((c: any) => c?.type === "text" && typeof c.text === "string")
    .map((c: any) => c.text)
    .join("")
    .trim();
}

// Strips wrapping the model sometimes adds despite the system prompt: a fenced
// code block, or the whole post in matching quotes.
function cleanOutput(text: string): string {
  let out = text.trim();
  const fenced = out.match(/^```(?:\w+)?\n([\s\S]*?)\n?```$/);
  if (fenced) out = fenced[1].trim();
  // [\s\S] rather than . with the `s` flag: this file is compiled against a
  // pre-ES2018 target, where dotAll isn't available. A post is routinely
  // multi-line, so the match has to cross newlines.
  if (out.length > 1 && /^["'“][\s\S]*["'”]$/.test(out)) {
    out = out.replace(/^["'“]/, "").replace(/["'”]$/, "").trim();
  }
  return out;
}

export type WritePostOptions = {
  language?: string;
  tone?: string;
  length?: string;
  platforms?: string[];
  hashtags?: boolean;
  emojis?: boolean;
  current?: string; // existing draft to revise instead of writing fresh
  unattended?: boolean; // no human will review before publishing
};

// Thrown instead of returning an error shape so callers can't accidentally
// publish a failure message as post content. `status` carries the HTTP status
// the API route should surface.
export class WritePostError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "WritePostError";
    this.status = status;
  }
}

// Writes one post. Returns the post text, ready to publish.
export async function writePost(
  prompt: string,
  options: WritePostOptions = {}
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new WritePostError("AI writing isn't configured — set GEMINI_API_KEY.", 501);
  }

  const brief = (prompt || "").trim();
  const current = (options.current || "").trim();

  if (!brief) {
    throw new WritePostError("Describe what the post should say.", 400);
  }
  // A brief is a couple of sentences; anything this long is a paste accident and
  // would be slow and expensive for no benefit.
  if (brief.length > 4000) {
    throw new WritePostError("That brief is too long.", 400);
  }
  if (current.length > 8000) {
    throw new WritePostError("The existing post is too long to revise.", 400);
  }

  const lang = LANGUAGES[options.language as string] || LANGUAGES.english;
  const tone = TONES[options.tone as string] || TONES.professional;
  const length = LENGTHS[options.length as string] || LENGTHS.medium;

  const platforms = Array.isArray(options.platforms)
    ? options.platforms.filter((p) => PLATFORM_NOTES[p])
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
    options.hashtags === false
      ? "Do not use any hashtags."
      : "Hashtags are allowed where they fit the platform, at the end of the post."
  );
  directives.push(
    options.emojis === false
      ? "Do not use any emoji."
      : "A few tasteful emoji are allowed where they fit the tone."
  );

  if (options.unattended) directives.push(UNATTENDED_PROMPT);

  // Revise mode: the caller already has text, so the brief is an instruction
  // about that text rather than a description of a post to write from scratch.
  const input = current
    ? `Here is the current draft of the post:\n"""\n${current}\n"""\n\nRewrite it according to this instruction:\n"""\n${brief}\n"""\n\nOutput only the revised post.`
    : `Write the post from this brief:\n"""\n${brief}\n"""`;

  if (current) {
    directives.push(
      "You are revising an existing draft. Keep everything the instruction doesn't ask you to change, including any facts, names, links, and numbers already in it."
    );
  }

  let res: Response;
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
    throw new WritePostError("AI service timed out. Try again.", 504);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new WritePostError(data?.error?.message || "Couldn't write the post.", res.status);
  }

  const out = cleanOutput(extractText(data));
  if (!out) {
    // A safety block or an empty completion. Saying nothing came back is more
    // useful than handing back an empty composer.
    throw new WritePostError("The AI returned nothing. Try rephrasing your brief.", 502);
  }

  return out;
}
