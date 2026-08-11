// Global, reusable image-generation helper. Call generateImage(prompt, options)
// from any client component to get an AI-generated image back. It hits our
// server route /api/generate-image (which calls Gemini and keeps GEMINI_API_KEY
// server-side), so nothing sensitive ships to the browser.

// The option sets the generator UI offers. Kept here rather than in the
// component so any other composer can reuse the same controls, and so the
// labels stay in one place. The `value`s must match the keys the route accepts.
//
// Each aspect ratio names the platform it's meant for — that's the choice the
// user is actually making ("this is for a story"), not the raw ratio.
export const IMAGE_ASPECTS = [
  { value: "square", label: "Square", hint: "1:1 · Feed" },
  { value: "portrait", label: "Portrait", hint: "4:5 · Instagram" },
  { value: "landscape", label: "Landscape", hint: "16:9 · LinkedIn" },
  { value: "story", label: "Story", hint: "9:16 · Reels" },
];

export const IMAGE_STYLES = [
  { value: "photo", label: "Photographic" },
  { value: "illustration", label: "Illustration" },
  { value: "render3d", label: "3D render" },
  { value: "minimal", label: "Minimal" },
  { value: "cinematic", label: "Cinematic" },
  { value: "none", label: "No style" },
];

// A few starting points for the prompt box, so the first use isn't a blank page.
export const IMAGE_EXAMPLES = [
  "A sunlit desk with a laptop and a cup of coffee",
  "An abstract gradient background in blue and violet",
  "A team collaborating around a whiteboard",
  "A single plant on a clean studio backdrop",
];

// Generate an image from a text prompt.
//   prompt   — what the image should show (required)
//   options  — { aspect, style }, matching the values above
// Returns { dataUrl, contentType } where dataUrl is a base64 `data:` URL you can
// drop straight into an <img src>. Throws Error(message) on failure — the route
// sends human-readable messages, so err.message is safe to show.
export async function generateImage(prompt, options = {}) {
  const clean = (prompt || "").trim();
  if (!clean) throw new Error("Describe the image you want.");

  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: clean, ...options }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't generate the image.");
  return data; // { dataUrl, contentType }
}

// Convenience wrapper: generate an image and return it as a File, ready to hand
// to a FormData upload (the same shape the publish/post routes expect). The
// filename defaults to a plain .jpg but honours the real content type.
export async function generateImageFile(
  prompt,
  options = {},
  filename = "generated-image"
) {
  const { dataUrl, contentType } = await generateImage(prompt, options);
  return dataUrlToFile(dataUrl, contentType, filename);
}

// Turn an already-generated data URL into a File. Split out from
// generateImageFile so the UI can preview an image first and only convert it
// once the user accepts it — no second round-trip to regenerate.
export function dataUrlToFile(
  dataUrl,
  contentType = "image/jpeg",
  filename = "generated-image"
) {
  const blob = dataUrlToBlob(dataUrl, contentType);
  const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
  return new File([blob], `${filename}.${ext}`, { type: blob.type });
}

// Ask the AI to suggest an image prompt from the post's text, so the user
// doesn't have to describe a scene from scratch. Returns the prompt string.
export async function suggestImagePrompt(text) {
  const clean = (text || "").trim();
  if (!clean) throw new Error("Write your post first, then I can suggest an image.");

  const res = await fetch("/api/ai/image-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't suggest a prompt.");
  return data.prompt || "";
}

// Decode a base64 `data:` URL into a Blob without any network round-trip.
export function dataUrlToBlob(dataUrl, fallbackType = "image/jpeg") {
  const [meta, base64] = dataUrl.split(",");
  const type = meta.match(/data:(.*?)(;|$)/)?.[1] || fallbackType;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
