// Global, reusable image-generation helper. Call generateImage(prompt) from any
// client component to get an AI-generated image back. It hits our server route
// /api/generate-image (which proxies the Cloudflare worker and keeps the API
// token server-side), so nothing sensitive ships to the browser.

// Generate an image from a text prompt.
// Returns { dataUrl, contentType } where dataUrl is a base64 `data:` URL you can
// drop straight into an <img src>. Throws Error(reason) on failure.
export async function generateImage(prompt) {
  const clean = (prompt || "").trim();
  if (!clean) throw new Error("missing_prompt");

  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: clean }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "generation_failed");
  return data; // { dataUrl, contentType }
}

// Convenience wrapper: generate an image and return it as a File, ready to hand
// to a FormData upload (the same shape the publish/post routes expect). The
// filename defaults to a plain .jpg but honours the real content type.
export async function generateImageFile(prompt, filename = "generated-image") {
  const { dataUrl, contentType } = await generateImage(prompt);
  const blob = dataUrlToBlob(dataUrl, contentType);
  const ext = (contentType.split("/")[1] || "jpg").split("+")[0];
  return new File([blob], `${filename}.${ext}`, { type: contentType });
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
