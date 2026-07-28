import { NextResponse } from "next/server";

// Proxies the Cloudflare image-generation worker. Runs server-side so the API
// token (IMAGE_GEN_API_TOKEN) never reaches the browser. The worker returns raw
// image bytes; we hand them back to the client as a base64 data URL so it can
// preview the image and turn it into a File for publishing.
//
// Request:  { prompt: string }
// Response: { dataUrl: string, contentType: string }
export async function POST(request) {
  const apiUrl = process.env.IMAGE_GEN_API_URL;
  const apiToken = process.env.IMAGE_GEN_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return NextResponse.json(
      { error: "image_gen_not_configured" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "missing_prompt" }, { status: 400 });
  }

  let res;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
      // Image generation can be slow; give it a generous bounded timeout.
      signal: AbortSignal.timeout(120000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.name === "TimeoutError" ? "generation_timed_out" : "upstream_unreachable" },
      { status: 504 }
    );
  }

  if (!res.ok) {
    // Surface the worker's error text when it isn't an image.
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: detail?.slice(0, 300) || "generation_failed" },
      { status: res.status }
    );
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;

  return NextResponse.json({ dataUrl, contentType });
}
