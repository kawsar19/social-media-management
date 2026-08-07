// LinkedIn text formatter helpers.
//
// LinkedIn has NO native rich text — you can't send real <b>/<i> markup in a
// post. Tools like typegrow.com fake it with Unicode "Mathematical Alphanumeric
// Symbols": each A–Z / a–z / 0–9 character has a bold, italic, bold-italic, and
// other variant at a fixed code-point offset. Substituting those makes text
// render styled anywhere Unicode is supported — including the LinkedIn composer.
//
// These functions map a plain ASCII string to its styled equivalent and back.
// Characters with no styled variant (punctuation, spaces, emoji) pass through
// unchanged, so round-tripping is safe.

// Base ranges we transform. Everything else is left as-is.
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

// Build a { plainChar -> styledChar } map from the Unicode block start points.
// upperStart/lowerStart/digitStart are the code points of "A"/"a"/"0" in that
// styled block; pass null when a block has no styled digits (most don't).
function buildMap({ upperStart, lowerStart, digitStart }) {
  const map = {};
  if (upperStart != null) {
    for (let i = 0; i < UPPER.length; i++) {
      map[UPPER[i]] = String.fromCodePoint(upperStart + i);
    }
  }
  if (lowerStart != null) {
    for (let i = 0; i < LOWER.length; i++) {
      map[LOWER[i]] = String.fromCodePoint(lowerStart + i);
    }
  }
  if (digitStart != null) {
    for (let i = 0; i < DIGITS.length; i++) {
      map[DIGITS[i]] = String.fromCodePoint(digitStart + i);
    }
  }
  return map;
}

// Unicode block starting code points (Mathematical Alphanumeric Symbols).
const STYLE_MAPS = {
  // 𝗕𝗼𝗹𝗱 (sans-serif bold) — the variant LinkedIn tools use by default.
  bold: buildMap({ upperStart: 0x1d5d4, lowerStart: 0x1d5ee, digitStart: 0x1d7ec }),
  // 𝘐𝘵𝘢𝘭𝘪𝘤 (sans-serif italic) — no styled digits exist, so digits stay plain.
  italic: buildMap({ upperStart: 0x1d608, lowerStart: 0x1d622, digitStart: null }),
  // 𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙘 (sans-serif bold italic).
  boldItalic: buildMap({ upperStart: 0x1d63c, lowerStart: 0x1d656, digitStart: null }),
};

// Reverse lookup: styled code point -> plain char, so we can detect and strip an
// existing style (toggling off) and swap between styles.
const REVERSE_MAP = {};
for (const map of Object.values(STYLE_MAPS)) {
  for (const [plain, styled] of Object.entries(map)) {
    REVERSE_MAP[styled] = plain;
  }
}

// Underline / strikethrough are combining marks appended AFTER each character,
// not code-point substitutions — so they compose with any of the above.
const COMBINING = {
  underline: "̲", // combining low line
  strikethrough: "̶", // combining long stroke overlay
};

// Strip our combining marks from a string (so toggling is reversible).
function stripCombining(str) {
  return str.replace(/[̶̲]/g, "");
}

// Convert any styled character back to its plain ASCII form; leaves normal
// characters untouched. Also removes combining underline/strikethrough marks.
export function toPlain(str) {
  const noCombining = stripCombining(str);
  let out = "";
  for (const ch of noCombining) {
    out += REVERSE_MAP[ch] ?? ch;
  }
  return out;
}

// Apply a code-point style ("bold" | "italic" | "boldItalic") to a string.
// Always normalises to plain first so re-styling swaps cleanly instead of
// stacking. Characters without a styled variant pass through.
export function applyStyle(str, style) {
  const map = STYLE_MAPS[style];
  if (!map) return str;
  const plain = toPlain(str);
  let out = "";
  for (const ch of plain) {
    out += map[ch] ?? ch;
  }
  return out;
}

// Apply a combining style ("underline" | "strikethrough") to a string. Appends
// the mark after every visible (non-space) character. Reapplying is a no-op-ish
// toggle handled by the caller via isStyled().
export function applyCombining(str, style) {
  const mark = COMBINING[style];
  if (!mark) return str;
  // Add the mark after each character; skip whitespace so lines stay clean.
  let out = "";
  for (const ch of stripCombining(str)) {
    out += /\s/.test(ch) ? ch : ch + mark;
  }
  return out;
}

// Best-effort check: does this selection already carry the given style? Used to
// toggle a style off when the user clicks the same button again.
export function isStyled(str, style) {
  if (style === "underline" || style === "strikethrough") {
    return str.includes(COMBINING[style]);
  }
  const map = STYLE_MAPS[style];
  if (!map) return false;
  const styledChars = new Set(Object.values(map));
  // Walk to the first character that carries (or could carry) a style, and
  // decide from it. A styled char in THIS block -> true. A styled char from a
  // DIFFERENT block, or a plain ASCII letter/digit -> false. Punctuation and
  // spaces have no styled variant, so we skip them and keep looking.
  for (const ch of str) {
    if (styledChars.has(ch)) return true; // styled in this block
    if (REVERSE_MAP[ch]) return false; // styled, but a different block
    if (/[A-Za-z0-9]/.test(ch)) return false; // plain letter/digit -> not styled
  }
  return false;
}

// Turn selected lines into a bullet or numbered list. Operates line-by-line on
// the given block of text.
export function toBulletList(str) {
  return str
    .split("\n")
    .map((line) => (line.trim() ? `• ${line.replace(/^[•\-\d.\s]+/, "")}` : line))
    .join("\n");
}

export function toNumberedList(str) {
  let n = 0;
  return str
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      n += 1;
      return `${n}. ${line.replace(/^[•\-\d.\s]+/, "")}`;
    })
    .join("\n");
}

// Ready-made hook openers. Good LinkedIn posts lead with a scroll-stopping first
// line; these are proven templates the user can drop in and edit. {topic} is a
// placeholder they replace.
export const HOOKS = [
  "I made a $10,000 mistake so you don't have to. 👇",
  "Nobody talks about this, but it changed everything for me:",
  "3 years ago I knew nothing about {topic}. Today I do this full-time.",
  "Unpopular opinion: {topic} is easier than everyone makes it sound.",
  "Here's what I wish someone told me about {topic} when I started:",
  "Stop scrolling. This 30-second read will save you hours.",
  "The best career advice I ever got fits in one sentence:",
  "Everyone wants the result. Almost no one wants the process. 🧵",
];
