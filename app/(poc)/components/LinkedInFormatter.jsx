"use client";

// LinkedIn Post Formatter — a lightweight toolbar over a plain textarea that
// produces Unicode-styled text (bold / italic / underline / strikethrough /
// lists) plus hook templates, matching what standalone tools like
// typegrow.com/tools/linkedin-text-formatter do. LinkedIn has no native rich
// text, so styling is faked with Unicode characters that paste in styled.
//
// It's a controlled component: the parent owns the text via `value`/`onChange`
// (the same `text`/`setText` the publish page already uses), so whatever the
// user formats here flows straight into the shared post content and gets
// published to LinkedIn as-is.

import { useRef, useState } from "react";
import {
  FaBold,
  FaItalic,
  FaUnderline,
  FaStrikethrough,
  FaListUl,
  FaListOl,
  FaRegCopy,
  FaCheck,
} from "react-icons/fa6";
import { FiZap } from "react-icons/fi";
import {
  applyStyle,
  applyCombining,
  toPlain,
  isStyled,
  toBulletList,
  toNumberedList,
  HOOKS,
} from "../lib/linkedinFormatter";

// A single toolbar button. Declared at module scope (not inside the component)
// so it isn't recreated every render.
function Tool({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

export default function LinkedInFormatter({ value, onChange }) {
  const textareaRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [showHooks, setShowHooks] = useState(false);

  // Replace the current selection (or the whole text, if nothing is selected)
  // with `transform(selected)` and keep the caret sensible afterwards.
  function transformSelection(transform) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const hasSelection = start !== end;

    // With no selection, format the whole text — most people expect that.
    const from = hasSelection ? start : 0;
    const to = hasSelection ? end : value.length;

    const before = value.slice(0, from);
    const target = value.slice(from, to);
    const after = value.slice(to);
    const styled = transform(target);
    const next = before + styled + after;
    onChange(next);

    // Restore a selection over the newly-styled span after React re-renders.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from, from + styled.length);
    });
  }

  // Toggle a style on the current selection: if it's already styled with
  // `style`, strip it back to plain; otherwise apply it. `apply` is the styling
  // function (applyStyle/applyCombining) bound to the style name. This is what
  // makes the toolbar buttons behave like real bold/italic toggles.
  function toggleStyle(style, apply) {
    transformSelection((s) => (isStyled(s, style) ? toPlain(s) : apply(s)));
  }

  function insertAtStart(snippet) {
    const next = value ? `${snippet}\n\n${value}` : snippet;
    onChange(next);
    setShowHooks(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(value || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; silently ignore — user can still select-copy.
    }
  }

  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-400">
        <FaBold className="h-3 w-3" /> LinkedIn formatter
      </div>

      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
        <Tool title="Bold" onClick={() => toggleStyle("bold", (s) => applyStyle(s, "bold"))}>
          <FaBold className="h-4 w-4" />
        </Tool>
        <Tool title="Italic" onClick={() => toggleStyle("italic", (s) => applyStyle(s, "italic"))}>
          <FaItalic className="h-4 w-4" />
        </Tool>
        <Tool
          title="Underline"
          onClick={() => toggleStyle("underline", (s) => applyCombining(s, "underline"))}
        >
          <FaUnderline className="h-4 w-4" />
        </Tool>
        <Tool
          title="Strikethrough"
          onClick={() => toggleStyle("strikethrough", (s) => applyCombining(s, "strikethrough"))}
        >
          <FaStrikethrough className="h-4 w-4" />
        </Tool>

        <span className="mx-1 h-5 w-px bg-slate-600" />

        <Tool title="Bullet list" onClick={() => transformSelection(toBulletList)}>
          <FaListUl className="h-4 w-4" />
        </Tool>
        <Tool title="Numbered list" onClick={() => transformSelection(toNumberedList)}>
          <FaListOl className="h-4 w-4" />
        </Tool>

        <span className="mx-1 h-5 w-px bg-slate-600" />

        <button
          type="button"
          onClick={() => setShowHooks((s) => !s)}
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-amber-500 transition hover:bg-white/10"
        >
          <FiZap className="h-3.5 w-3.5" /> Hooks
        </button>

        <button
          type="button"
          onClick={copyToClipboard}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-300 transition hover:bg-white/10"
        >
          {copied ? (
            <>
              <FaCheck className="h-3.5 w-3.5 text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <FaRegCopy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>

      {/* Hook picker */}
      {showHooks && (
        <div className="mb-2 grid gap-1 rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="mb-1 text-[11px] text-slate-400">
            Tap a hook to add it as your opening line — then replace{" "}
            <code className="text-amber-300">{"{topic}"}</code>.
          </p>
          {HOOKS.map((hook) => (
            <button
              key={hook}
              type="button"
              onClick={() => insertAtStart(hook)}
              className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 transition hover:bg-white/10"
            >
              {hook}
            </button>
          ))}
        </div>
      )}

      {/* The editor itself (plain textarea; styling is Unicode inside the text) */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="Write your LinkedIn post… select text, then tap a style."
        className="field w-full resize-none"
      />

      <p className="mt-1.5 text-[11px] text-slate-500">
        Styling uses Unicode so it pastes in styled anywhere — LinkedIn has no
        real bold/italic. Select text first, or format everything at once.
      </p>
    </div>
  );
}
