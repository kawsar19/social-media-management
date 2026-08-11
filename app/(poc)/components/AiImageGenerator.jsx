"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiX,
  FiLoader,
  FiZap,
  FiImage,
  FiRefreshCw,
  FiCheck,
  FiCrop,
  FiFeather,
  FiAlertCircle,
  FiEdit3,
} from "react-icons/fi";
import {
  generateImage,
  suggestImagePrompt,
  dataUrlToFile,
  IMAGE_ASPECTS,
  IMAGE_STYLES,
  IMAGE_EXAMPLES,
} from "../lib/imageGeneration";

// A modal that turns a description into an image. The result is previewed
// inside the modal rather than dropped straight into the composer, so a bad
// image can be regenerated or discarded without replacing whatever media the
// user had already attached.
//
// Props:
//   open      — whether the modal is shown
//   onClose   — called to dismiss it
//   onUse     — called with the accepted image as a File
//   postText  — the composer's current text, used to suggest a prompt
export default function AiImageGenerator({ open, ...props }) {
  // Gate the panel on `open` so it mounts fresh every time. That makes the
  // panel's useState initializers the reset — a reopened modal never shows the
  // previous run's image, with no reset effect to keep in sync.
  if (!open) return null;
  return <GeneratorPanel {...props} />;
}

function GeneratorPanel({ onClose, onUse, postText = "" }) {
  const hasPostText = postText.trim().length > 0;

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("square");
  const [style, setStyle] = useState("photo");

  // The generated image, kept as { dataUrl, contentType } until accepted. Only
  // then is it converted to a File — no point paying for the decode on an
  // image the user is about to discard.
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");

  const promptRef = useRef(null);
  const resultRef = useRef(null);

  // Move the caret into the prompt box on open. Deferred a frame because the
  // dialog hasn't painted yet on the first commit.
  useEffect(() => {
    const id = requestAnimationFrame(() => promptRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Lock the page behind the modal. Without this the background scrolls under
  // the overlay on wheel/trackpad, which is what makes a dialog feel broken.
  // The scrollbar's width is added back as padding so the page doesn't shift
  // sideways as it disappears.
  useEffect(() => {
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, []);

  // Escape closes, matching what a dialog is expected to do.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function generate() {
    const clean = prompt.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    try {
      const image = await generateImage(clean, { aspect, style });
      setResult(image);
      // Bring the fresh image into view — on a short window it generates below
      // the fold, and nothing appearing looks like nothing happened.
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      );
    } catch (err) {
      setError(err?.message || "Couldn't generate the image.");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  // Fill the prompt box from the post's text, so the user doesn't have to
  // describe a scene from scratch. Overwrites whatever is there — the button is
  // only offered as a starting point, and the box stays editable after.
  async function suggest() {
    if (suggesting || busy || !hasPostText) return;
    setSuggesting(true);
    setError("");
    try {
      const suggested = await suggestImagePrompt(postText);
      setPrompt(suggested);
      promptRef.current?.focus();
    } catch (err) {
      setError(err?.message || "Couldn't suggest a prompt.");
    } finally {
      setSuggesting(false);
    }
  }

  function use() {
    if (!result) return;
    onUse?.(dataUrlToFile(result.dataUrl, result.contentType));
    onClose?.();
  }

  const activeAspect = IMAGE_ASPECTS.find((a) => a.value === aspect);

  return createPortal(
    // Portalled to <body>: the app shell is a positioned, background-attachment
    // ancestor, and a `fixed` overlay nested inside it is clipped to the shell
    // instead of covering the viewport.
    <div
      className="ai-overlay"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop closes — a
        // drag that began inside the panel shouldn't dismiss it.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-image-title"
        className="ai-panel"
      >
        {/* Header — pinned, so the title and close button stay reachable while
            the body scrolls. */}
        <div className="ai-panel-head">
          <div className="ai-glow" aria-hidden />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="ai-chip">
                <FiImage className="h-3.5 w-3.5" /> AI images
              </span>
              <h2
                id="ai-image-title"
                className="mt-2.5 text-[1.35rem] font-bold leading-tight tracking-tight text-white"
              >
                Generate an image
              </h2>
              <p className="pretty mt-1 text-sm text-slate-400">
                Describe what you want to see. The AI creates the image.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ai-close shrink-0"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body. The panel itself is height-capped, so overflow
            happens here rather than on the page behind it. */}
        <div className="ai-panel-body">
          {/* Prompt */}
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="ai-image-prompt" className="ai-label">
              What should the image show?
            </label>
            {/* Only offered when there's a post to read — with an empty
                composer there'd be nothing to base a suggestion on. */}
            {hasPostText && (
              <button
                type="button"
                onClick={suggest}
                disabled={suggesting || busy}
                className="ai-copy"
              >
                {suggesting ? (
                  <>
                    <FiLoader className="h-3 w-3 animate-spin" /> Reading post…
                  </>
                ) : (
                  <>
                    <FiEdit3 className="h-3 w-3" /> Suggest from my post
                  </>
                )}
              </button>
            )}
          </div>
          <div className="ai-brief">
            <textarea
              id="ai-image-prompt"
              name="ai-image-prompt"
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // Enter alone inserts a newline; ⌘/Ctrl+Enter generates, the
                // usual shortcut for "submit from a multi-line box".
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  generate();
                }
              }}
              rows={3}
              maxLength={2000}
              disabled={busy}
              placeholder="e.g. A sunlit desk with a laptop and a cup of coffee"
              className="field w-full resize-none pb-8"
            />
            {/* Sits inside the box so the hint doesn't cost a whole extra row. */}
            <span className="ai-kbd-hint">
              <kbd className="ai-kbd">⌘</kbd>
              <kbd className="ai-kbd">↵</kbd>
              <span className="ml-1">to generate</span>
            </span>
          </div>

          {/* Example prompts — a blank prompt box is the hardest part of using
              this, so give it a starting point. */}
          {!prompt.trim() && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {IMAGE_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="ai-example"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {/* Shape. Chips rather than a dropdown — there are only four, and the
              platform hint is what makes the choice obvious. */}
          <div className="mt-5">
            <p className="ai-label mb-1.5 flex items-center gap-1.5">
              <FiCrop className="h-3 w-3" /> Shape
            </p>
            <div className="flex flex-wrap gap-2">
              {IMAGE_ASPECTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAspect(a.value)}
                  aria-pressed={aspect === a.value}
                  disabled={busy}
                  className={"ai-toggle" + (aspect === a.value ? " is-on" : "")}
                >
                  {a.label}
                  <span className="ml-1 opacity-60">{a.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div className="mt-4">
            <p className="ai-label mb-1.5 flex items-center gap-1.5">
              <FiFeather className="h-3 w-3" /> Style
            </p>
            <div className="flex flex-wrap gap-2">
              {IMAGE_STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  aria-pressed={style === s.value}
                  disabled={busy}
                  className={"ai-toggle" + (style === s.value ? " is-on" : "")}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="ai-error mt-4">
              <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          {/* Skeleton while generating — a spinner on the button alone leaves
              this area blank, which reads as nothing happening. Image
              generation is slow enough that this matters more than it does for
              text. */}
          {busy && !result && (
            <div className="ai-skeleton mt-5" aria-hidden>
              <span style={{ width: "100%", height: "9rem" }} />
              <span style={{ width: "40%" }} />
            </div>
          )}

          {/* Result */}
          {result && (
            <div ref={resultRef} className="ai-result mt-5">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="ai-label ai-label-ok flex items-center gap-1.5">
                  <FiCheck className="h-3 w-3" /> Generated image
                </span>
                <span className="text-xs text-slate-500">
                  {activeAspect?.label} · {activeAspect?.hint}
                </span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.dataUrl}
                alt={prompt}
                className="app-img max-h-72 w-full rounded-xl object-contain"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Not quite right? Adjust the prompt and regenerate.
              </p>
            </div>
          )}
        </div>

        {/* Footer — pinned, so the primary action is always in reach no matter
            how tall the generated image is. */}
        <div className="ai-panel-foot">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className={result ? "btn btn-ghost" : "btn btn-primary"}
          >
            {busy ? (
              <>
                <FiLoader className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : result ? (
              <>
                <FiRefreshCw className="h-4 w-4" /> Regenerate
              </>
            ) : (
              <>
                <FiZap className="h-4 w-4" /> Generate
              </>
            )}
          </button>
          {result && (
            <button
              type="button"
              onClick={use}
              disabled={busy}
              className="btn btn-primary"
            >
              <FiCheck className="h-4 w-4" /> Use this image
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
