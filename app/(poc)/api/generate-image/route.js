import { NextResponse } from "next/server";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

// Aspect ratios offered by the composer, keyed by what the client sends. The
// value is what Gemini accepts. Kept server-side too so a bad value from the
// browser can't reach the API.
const ASPECT_RATIOS = {
  square: "1:1",
  portrait: "4:5",
  landscape: "16:9",
  story: "9:16",
};

// Style presets. Each one is folded into the prompt as a suffix — Gemini has no
// separate style parameter, so the styling has to live in the prompt text.
const STYLES = {
  none: "",
  photo:
    "Photorealistic photograph, natural lighting, sharp focus, high detail, shot on a professional camera.",
  illustration:
    "Clean vector illustration, flat colours, bold simple shapes, minimal shading.",
  render3d:
    "Polished 3D render, soft studio lighting, subtle depth of field, glossy materials.",
  minimal:
    "Minimalist composition, lots of negative space, limited muted colour palette, simple geometry.",
  cinematic:
    "Cinematic still, dramatic directional lighting, moody colour grading, shallow depth of field.",
};

// Social images carry a brand's name, so the model must not invent logos or
// text: garbled lettering is the most common way an AI image is unusable, and a
// real-looking brand mark would go out publicly under the user's account.
const PROMPT_GUARDRAILS =
  "Do not render any text, words, letters, numbers, logos, watermarks, or brand marks in the image.";

// Pulls the generated image out of an Interactions response. The image lives in
// the last model_output step's content blocks; `output_image` is a convenience
// field for the same thing, used as a fallback in case the steps shape differs.
function extractImage(data) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps.filter((s) => s.type === "model_output").reverse()) {
    const parts = Array.isArray(step?.content) ? step.content : [];
    const image = parts.find(
      (c) => c?.type === "image" && typeof c.data === "string" && c.data
    );
    if (image) {
      return { data: image.data, mimeType: image.mime_type || "image/jpeg" };
    }
  }
  const fallback = data?.output_image;
  if (typeof fallback?.data === "string" && fallback.data) {
    return { data: fallback.data, mimeType: fallback.mime_type || "image/jpeg" };
  }
  return null;
}

// POST /api/generate-image  { prompt, aspect?, style? }
// Generates an image with Gemini and returns it as a base64 data URL, so the
// client can preview it and turn it straight into a File for publishing. Runs
// server-side so GEMINI_API_KEY never reaches the browser.
// Response: { dataUrl, contentType }
export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Image generation isn't configured — set GEMINI_API_KEY." },
      { status: 501 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json(
      { error: "Describe the image you want." },
      { status: 400 }
    );
  }
  // A prompt is a sentence or two; anything this long is a paste accident.
  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: "That prompt is too long." },
      { status: 400 }
    );
  }

  const aspectRatio = ASPECT_RATIOS[body.aspect] || ASPECT_RATIOS.square;
  const style = STYLES[body.style] ?? STYLES.none;

  const fullPrompt = [prompt, style, PROMPT_GUARDRAILS]
    .filter(Boolean)
    .join("\n\n");

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
        input: [{ type: "text", text: fullPrompt }],
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: aspectRatio,
        },
      }),
      // Image generation is slow; give it a generous bounded timeout.
      signal: AbortSignal.timeout(120000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err?.name === "TimeoutError"
            ? "Image generation timed out. Try again."
            : "Couldn't reach the image service.",
      },
      { status: 504 }
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Quota is the error users actually hit here: Gemini's free tier has no
    // image quota at all, so say what to do instead of echoing the raw message.
    const raw = data?.error?.message || "";
    if (res.status === 429 || /quota/i.test(raw)) {
      return NextResponse.json(
        {
          error:
            "Gemini image generation needs billing enabled on the API key — the free tier has no image quota.",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: raw || "Couldn't generate the image." },
      { status: res.status }
    );
  }

  const image = extractImage(data);
  if (!image) {
    // A safety block or an empty completion — the request succeeded but there's
    // no image to hand back.
    return NextResponse.json(
      { error: "No image came back. Try rephrasing your prompt." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    dataUrl: `data:${image.mimeType};base64,${image.data}`,
    contentType: image.mimeType,
  });
}
