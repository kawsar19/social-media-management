// Global, reusable AI post-writing helper. Call writePost(...) from any client
// component to turn a short brief into a ready-to-publish post. It hits our
// server route /api/ai/write-post (which calls Gemini and keeps GEMINI_API_KEY
// server-side), so nothing sensitive ships to the browser.

// The option sets the composer UI offers. Kept here rather than in the page so
// any other composer can reuse the same controls, and so the labels stay in one
// place. The `value`s must match the keys the route accepts.
export const WRITE_LANGUAGES = [
  { value: "english", label: "English" },
  { value: "bangla", label: "বাংলা" },
  { value: "banglish", label: "Banglish" },
];

export const WRITE_TONES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
  { value: "excited", label: "Excited" },
  { value: "informative", label: "Informative" },
  { value: "funny", label: "Funny" },
];

export const WRITE_LENGTHS = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

// A few starting points for the prompt box, so the first use isn't a blank page.
export const WRITE_EXAMPLES = [
  "Announce that our new website is live",
  "Share a tip about staying productive while working from home",
  "Thank our customers for a great year",
  "Introduce a new team member joining as a designer",
];

// Write a post from a brief.
//   prompt   — what the post should say (required)
//   options  — { language, tone, length, platforms, hashtags, emojis, current }
//              `platforms` is a list of platform ids the post is going to, so
//              the wording suits them. `current` is the composer's existing
//              text: pass it to revise that draft instead of starting over.
// Returns the post text. Throws Error(message) on failure — the route sends
// human-readable messages, so err.message is safe to show.
export async function writePost(prompt, options = {}) {
  const clean = (prompt || "").trim();
  if (!clean) throw new Error("Describe what the post should say.");

  const res = await fetch("/api/ai/write-post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: clean, ...options }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't write the post.");
  return data.text || "";
}
