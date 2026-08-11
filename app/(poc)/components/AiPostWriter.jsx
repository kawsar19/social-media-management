"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiX,
  FiLoader,
  FiZap,
  FiEdit3,
  FiRefreshCw,
  FiCheck,
  FiCopy,
  FiHash,
  FiSmile,
  FiGlobe,
  FiMic,
  FiAlignLeft,
  FiAlertCircle,
} from "react-icons/fi";
import {
  writePost,
  WRITE_LANGUAGES,
  WRITE_TONES,
  WRITE_LENGTHS,
  WRITE_EXAMPLES,
} from "../lib/postWriter";

// One labelled dropdown. The three writing options are identical apart from
// their list, and the explicit id/htmlFor pairing is what makes the label
// actually announce with the control.
function OptionSelect({ id, label, Icon, value, onChange, options, disabled }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="ai-label mb-1.5 flex items-center gap-1.5"
      >
        <Icon className="h-3 w-3" />
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="field w-full text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// A modal that turns a short brief into a post. The generated text lands in a
// preview inside the modal rather than straight in the composer, so a bad
// result can be regenerated or discarded without destroying what the user had
// already written.
//
// Props:
//   open       — whether the modal is shown
//   onClose    — called to dismiss it
//   onUse      — called with the accepted post text
//   platforms  — platform ids the post is going to, so the wording suits them
//   current    — the composer's existing text. When set, the modal starts in
//                "improve" mode: the brief is an instruction about that draft.
export default function AiPostWriter({ open, ...props }) {
  // Gate the panel on `open` so it mounts fresh every time. That makes the
  // panel's useState initializers the reset — a reopened modal never shows the
  // previous run's post, with no reset effect to keep in sync.
  if (!open) return null;
  return <WriterPanel {...props} />;
}

function WriterPanel({ onClose, onUse, platforms = [], current = "" }) {
  const hasDraft = current.trim().length > 0;

  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("english");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [hashtags, setHashtags] = useState(true);
  const [emojis, setEmojis] = useState(true);
  // Only meaningful when `current` is non-empty: whether to revise that draft
  // or ignore it and write something new. Defaults to revising when there's
  // already a draft, which is what the button that opened this offered.
  const [improve, setImprove] = useState(hasDraft);

  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const promptRef = useRef(null);
  const resultRef = useRef(null);

  // Move the caret into the brief box on open. Deferred a frame because the
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
    const brief = prompt.trim();
    if (!brief || busy) return;
    setBusy(true);
    setError("");
    try {
      const text = await writePost(brief, {
        language,
        tone,
        length,
        platforms,
        hashtags,
        emojis,
        // Only send the draft when the user actually wants it revised.
        current: improve && hasDraft ? current : "",
      });
      setResult(text);
      // Bring the fresh post into view — on a short window it generates below
      // the fold, and nothing appearing looks like nothing happened.
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      );
    } catch (err) {
      setError(err?.message || "Couldn't write the post.");
      setResult("");
    } finally {
      setBusy(false);
    }
  }

  function use() {
    if (!result.trim()) return;
    onUse?.(result.trim());
    onClose?.();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked by permissions; the text is selectable in the
      // textarea either way, so there's nothing worth interrupting the user for.
    }
  }

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
        aria-labelledby="ai-writer-title"
        className="ai-panel"
      >
        {/* Header — pinned, so the title and close button stay reachable while
            the body scrolls. */}
        <div className="ai-panel-head">
          <div className="ai-glow" aria-hidden />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="ai-chip">
                <FiZap className="h-3.5 w-3.5" /> AI writer
              </span>
              <h2
                id="ai-writer-title"
                className="mt-2.5 text-[1.35rem] font-bold leading-tight tracking-tight text-white"
              >
                {improve ? "Improve your post" : "Write a post with AI"}
              </h2>
              <p className="pretty mt-1 text-sm text-slate-400">
                {improve
                  ? "Say what to change — your draft is rewritten around it."
                  : "Describe what you want to say. The AI writes the post."}
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
          {/* Write-new vs improve-existing. Only offered when there's a draft to
              improve — otherwise there's nothing to choose between. */}
          {hasDraft && (
            <div className="ai-segment mb-5">
              {[
                { id: false, label: "Write new", Icon: FiZap },
                { id: true, label: "Improve my draft", Icon: FiEdit3 },
              ].map(({ id, label, Icon }) => (
                <button
                  key={String(id)}
                  type="button"
                  onClick={() => setImprove(id)}
                  aria-pressed={improve === id}
                  className={
                    "ai-segment-btn" + (improve === id ? " is-active" : "")
                  }
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          )}

          {/* Brief */}
          <label htmlFor="ai-writer-brief" className="ai-label mb-1.5 block">
            {improve ? "What should change?" : "What's the post about?"}
          </label>
          <div className="ai-brief">
            <textarea
              id="ai-writer-brief"
              name="ai-writer-brief"
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
              maxLength={4000}
              disabled={busy}
              placeholder={
                improve
                  ? "e.g. Make it shorter and add a call to action"
                  : "e.g. Announce that our new website is live"
              }
              className="field w-full resize-none pb-8"
            />
            {/* Sits inside the box so the hint doesn't cost a whole extra row. */}
            <span className="ai-kbd-hint">
              <kbd className="ai-kbd">⌘</kbd>
              <kbd className="ai-kbd">↵</kbd>
              <span className="ml-1">to write</span>
            </span>
          </div>

          {/* Example briefs — a blank prompt box is the hardest part of using
              this, so give it a starting point. Hidden in improve mode, where
              the instruction depends on the user's own draft. */}
          {!improve && !prompt.trim() && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {WRITE_EXAMPLES.map((ex) => (
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

          {/* Options */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <OptionSelect
              id="ai-writer-language"
              label="Language"
              Icon={FiGlobe}
              value={language}
              onChange={setLanguage}
              options={WRITE_LANGUAGES}
              disabled={busy}
            />
            <OptionSelect
              id="ai-writer-tone"
              label="Tone"
              Icon={FiMic}
              value={tone}
              onChange={setTone}
              options={WRITE_TONES}
              disabled={busy}
            />
            <OptionSelect
              id="ai-writer-length"
              label="Length"
              Icon={FiAlignLeft}
              value={length}
              onChange={setLength}
              options={WRITE_LENGTHS}
              disabled={busy}
            />
          </div>

          {/* Toggles read as chips rather than bare checkboxes — they're
              on/off style choices, and the pressed state shows at a glance. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHashtags((v) => !v)}
              aria-pressed={hashtags}
              disabled={busy}
              className={"ai-toggle" + (hashtags ? " is-on" : "")}
            >
              <FiHash className="h-3.5 w-3.5" /> Hashtags
            </button>
            <button
              type="button"
              onClick={() => setEmojis((v) => !v)}
              aria-pressed={emojis}
              disabled={busy}
              className={"ai-toggle" + (emojis ? " is-on" : "")}
            >
              <FiSmile className="h-3.5 w-3.5" /> Emoji
            </button>
            {/* Naming the targets makes it clear the post is being shaped for
                them, not written generically. */}
            {platforms.length > 0 && (
              <span className="ml-auto text-xs text-slate-500">
                Tuned for{" "}
                <span className="font-medium text-slate-400">
                  {platforms.join(", ")}
                </span>
              </span>
            )}
          </div>

          {error && (
            <p className="ai-error mt-4">
              <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          {/* Skeleton while writing — a spinner on the button alone leaves this
              area blank, which reads as nothing happening. */}
          {busy && !result && (
            <div className="ai-skeleton mt-5" aria-hidden>
              <span style={{ width: "92%" }} />
              <span style={{ width: "78%" }} />
              <span style={{ width: "85%" }} />
              <span style={{ width: "45%" }} />
            </div>
          )}

          {/* Result — editable, so a nearly-right post can be fixed here
              instead of regenerating. */}
          {result && (
            <div ref={resultRef} className="ai-result mt-5">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="ai-writer-result"
                  className="ai-label ai-label-ok flex items-center gap-1.5"
                >
                  <FiCheck className="h-3 w-3" /> Generated post
                </label>
                <button type="button" onClick={copy} className="ai-copy">
                  {copied ? (
                    <>
                      <FiCheck className="h-3 w-3" /> Copied
                    </>
                  ) : (
                    <>
                      <FiCopy className="h-3 w-3" /> Copy
                    </>
                  )}
                </button>
              </div>
              <textarea
                id="ai-writer-result"
                name="ai-writer-result"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                rows={8}
                className="field w-full resize-y leading-relaxed"
              />
              <p className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                <span>Edit it here if it&apos;s nearly right.</span>
                <span className="tabular">{result.length} characters</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer — pinned, so the primary action is always in reach no matter
            how long the generated post is. */}
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
                <FiLoader className="h-4 w-4 animate-spin" /> Writing…
              </>
            ) : result ? (
              <>
                <FiRefreshCw className="h-4 w-4" /> Regenerate
              </>
            ) : (
              <>
                <FiZap className="h-4 w-4" /> Write post
              </>
            )}
          </button>
          {result && (
            <button
              type="button"
              onClick={use}
              disabled={busy || !result.trim()}
              className="btn btn-primary"
            >
              <FiCheck className="h-4 w-4" /> Use this post
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
