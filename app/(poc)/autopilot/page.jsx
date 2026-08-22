"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FaLinkedin, FaFacebook, FaThreads, FaInstagram } from "react-icons/fa6";
import {
  FiClock,
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiPlay,
  FiPause,
  FiEye,
  FiLoader,
  FiAlertTriangle,
  FiCheck,
  FiX,
  FiZap,
  FiCalendar,
  FiExternalLink,
} from "react-icons/fi";
import { filterEnabledPages } from "../lib/enabledPages";
import { fetchAccounts, getAccountsMap } from "../lib/socialTokens";
import {
  WRITE_LANGUAGES,
  WRITE_TONES,
  WRITE_LENGTHS,
} from "../lib/postWriter";
import {
  fetchAutoPosts,
  createAutoPost,
  updateAutoPost,
  toggleAutoPost,
  deleteAutoPost,
  previewAutoPost,
  browserTimezone,
  DAY_LABELS,
  formatTime,
} from "../lib/autopilot";

// Text-only automations, so YouTube is absent: a YouTube post is a video
// upload, and there is no video in an unattended text run. Instagram is listed
// but gated — it also requires media, so it can't be a target here either. Both
// come back if image generation is added to the cron.
const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn", Icon: FaLinkedin, accent: "text-sky-400" },
  { id: "facebook", label: "Facebook", Icon: FaFacebook, accent: "text-indigo-400" },
  { id: "threads", label: "Threads", Icon: FaThreads, accent: "text-slate-100" },
];

const EXAMPLE_PROMPTS = [
  "Share a short, practical productivity tip for small business owners",
  "Post an encouraging thought to start the working day",
  "Share an interesting fact about web development",
];

const emptyForm = () => ({
  name: "",
  prompt: "",
  language: "english",
  tone: "professional",
  length: "medium",
  hashtags: true,
  emojis: true,
  frequency: "daily",
  timeOfDay: "09:00",
  timezone: browserTimezone(),
  daysOfWeek: [1, 2, 3, 4, 5],
  platforms: { linkedin: false, facebook: false, threads: false },
  pageIds: [],
});

export default function AutopilotPage() {
  const [autoPosts, setAutoPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Connections, so the form can only offer destinations that actually exist.
  const [accountMeta, setAccountMeta] = useState({});
  const [fbPages, setFbPages] = useState([]);
  const [fbToken, setFbToken] = useState(null);

  // Form state. `editing` is the id being edited, or "new", or null for closed.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Preview modal — { id, name, text, loading, error }
  const [preview, setPreview] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchAutoPosts();
      setAutoPosts(list);
      // Cleared on success rather than up front, so the first render of a
      // reload doesn't flash the old error away before it's actually resolved.
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAccountsMap(), fetchAccounts()]).then(([map]) => {
      if (cancelled) return;
      setAccountMeta(map);
      setFbToken(map.facebook?.accessToken || null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Facebook publishes per Page, so the form needs the Page list to build one
  // target per selected Page.
  useEffect(() => {
    if (!fbToken) return;
    let cancelled = false;
    fetch("/api/auth/facebook/pages", {
      headers: { Authorization: `Bearer ${fbToken}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!cancelled && res.ok) setFbPages(filterEnabledPages(data.pages || []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fbToken]);

  const connected = {
    linkedin: Boolean(accountMeta.linkedin),
    facebook: Boolean(accountMeta.facebook),
    threads: Boolean(accountMeta.threads),
  };

  function openNew() {
    setForm(emptyForm());
    setFormError("");
    setEditing("new");
  }

  // Rebuild the form from a saved automation. Targets are flattened back into
  // the platform toggles + page ids the form works in.
  function openEdit(auto) {
    const platforms = { linkedin: false, facebook: false, threads: false };
    const pageIds = [];
    for (const t of auto.targets || []) {
      if (t.platform in platforms) platforms[t.platform] = true;
      if (t.platform === "facebook" && t.destinationId) pageIds.push(t.destinationId);
    }
    setForm({
      name: auto.name || "",
      prompt: auto.prompt || "",
      language: auto.language || "english",
      tone: auto.tone || "professional",
      length: auto.length || "medium",
      hashtags: auto.hashtags !== false,
      emojis: auto.emojis !== false,
      frequency: auto.frequency || "daily",
      timeOfDay: auto.timeOfDay || "09:00",
      timezone: auto.timezone || browserTimezone(),
      daysOfWeek: auto.daysOfWeek?.length ? auto.daysOfWeek : [1, 2, 3, 4, 5],
      platforms,
      pageIds,
    });
    setFormError("");
    setEditing(auto._id);
  }

  // Form selection → the target list the API stores. Mirrors the publish page's
  // buildTargets so an automation posts to exactly the same destinations a
  // manual publish would.
  function buildTargets() {
    const targets = [];
    if (form.platforms.linkedin && connected.linkedin) {
      targets.push({
        platform: "linkedin",
        accountName: accountMeta.linkedin?.platformName,
        destinationId: accountMeta.linkedin?.platformId,
      });
    }
    if (form.platforms.facebook && connected.facebook) {
      for (const pageId of form.pageIds) {
        const page = fbPages.find((p) => p.id === pageId);
        targets.push({
          platform: "facebook",
          accountName: accountMeta.facebook?.platformName,
          destinationId: pageId,
          destinationName: page?.name,
        });
      }
    }
    if (form.platforms.threads && connected.threads) {
      targets.push({
        platform: "threads",
        accountName: accountMeta.threads?.platformName,
        destinationId: accountMeta.threads?.platformId,
      });
    }
    return targets;
  }

  async function handleSave() {
    setFormError("");
    const targets = buildTargets();

    if (!form.prompt.trim()) {
      setFormError("Describe what the post should say.");
      return;
    }
    if (targets.length === 0) {
      setFormError(
        form.platforms.facebook && form.pageIds.length === 0
          ? "Pick at least one Facebook Page."
          : "Pick at least one destination."
      );
      return;
    }
    if (form.frequency === "weekly" && form.daysOfWeek.length === 0) {
      setFormError("Pick at least one day of the week.");
      return;
    }

    const payload = {
      name: form.name.trim() || "Untitled automation",
      prompt: form.prompt.trim(),
      language: form.language,
      tone: form.tone,
      length: form.length,
      hashtags: form.hashtags,
      emojis: form.emojis,
      targets,
      frequency: form.frequency,
      timeOfDay: form.timeOfDay,
      timezone: form.timezone,
      daysOfWeek: form.frequency === "weekly" ? form.daysOfWeek : [],
      enabled: true,
    };

    setSaving(true);
    try {
      if (editing === "new") await createAutoPost(payload);
      else await updateAutoPost(editing, payload);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(auto) {
    setBusyId(auto._id);
    try {
      await toggleAutoPost(auto._id, !auto.enabled);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(auto) {
    // Deleting stops future posts silently; a stray click here would be
    // noticed only when the posts stopped coming.
    if (!confirm(`Delete "${auto.name}"? Posts it already published stay put.`)) return;
    setBusyId(auto._id);
    try {
      await deleteAutoPost(auto._id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePreview(auto) {
    setPreview({ id: auto._id, name: auto.name, text: "", loading: true, error: "" });
    try {
      const text = await previewAutoPost(auto._id);
      setPreview({ id: auto._id, name: auto.name, text, loading: false, error: "" });
    } catch (err) {
      setPreview({
        id: auto._id,
        name: auto.name,
        text: "",
        loading: false,
        error: err.message,
      });
    }
  }

  const anyConnected = connected.linkedin || connected.facebook || connected.threads;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-lg shadow-rose-500/25">
                <FiZap className="h-4 w-4" />
              </span>
              Autopilot
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Save a prompt once. Every day at the time you pick, AI writes a fresh
              post and publishes it automatically.
            </p>
          </div>
          {anyConnected && (
            <button
              type="button"
              onClick={openNew}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-500/25 transition-all hover:brightness-110 active:scale-95"
            >
              <FiPlus className="h-3.5 w-3.5" />
              New automation
            </button>
          )}
        </div>
      </header>

      {/* Published without review, so the warning is stated plainly rather than
          buried in the form. */}
      <div className="note note-warn mb-6">
        <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-relaxed">
          These posts go out <strong>automatically, with nobody reviewing them</strong>.
          Use <em>Preview</em> a few times to see what your prompt actually produces
          before you leave it running.
        </p>
      </div>

      {error && (
        <div className="note note-danger mb-6" role="alert">
          <FiX className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!anyConnected && !loading && (
        <div className="glass rounded-2xl px-6 py-12 text-center">
          <p className="text-sm text-slate-400">
            Connect an account first — autopilot needs somewhere to post.
          </p>
          <Link
            href="/connect"
            className="btn btn-ghost mt-4 text-xs"
          >
            Go to Connect
            <FiExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <FiLoader className="h-4 w-4 animate-spin" />
          Loading automations…
        </div>
      ) : (
        anyConnected &&
        autoPosts.length === 0 && (
          <div className="surface-row rounded-2xl border-dashed px-6 py-12 text-center">
            <FiClock className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">No automations yet.</p>
            <button
              type="button"
              onClick={openNew}
              className="btn btn-ghost mt-4 text-xs"
            >
              <FiPlus className="h-3.5 w-3.5" />
              Create your first one
            </button>
          </div>
        )
      )}

      <div className="space-y-3">
        {autoPosts.map((auto) => (
          <AutomationCard
            key={auto._id}
            auto={auto}
            busy={busyId === auto._id}
            onToggle={() => handleToggle(auto)}
            onEdit={() => openEdit(auto)}
            onDelete={() => handleDelete(auto)}
            onPreview={() => handlePreview(auto)}
          />
        ))}
      </div>

      {editing && (
        <FormModal
          form={form}
          setForm={setForm}
          connected={connected}
          fbPages={fbPages}
          saving={saving}
          error={formError}
          isNew={editing === "new"}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function AutomationCard({ auto, busy, onToggle, onEdit, onDelete, onPreview }) {
  const lastRun = auto.runs?.[0];
  const platformLabels = [
    ...new Set((auto.targets || []).map((t) => t.destinationName || t.platform)),
  ];

  return (
    <div className="glass glass-hover rounded-2xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white">{auto.name}</h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                auto.enabled
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-slate-500/15 text-slate-400"
              }`}
            >
              {auto.enabled ? "Active" : "Paused"}
            </span>
          </div>

          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
            {auto.prompt}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <FiClock className="h-3 w-3" />
              {formatTime(auto.timeOfDay)}
              <span className="text-slate-600">·</span>
              {auto.frequency === "daily"
                ? "Daily"
                : (auto.daysOfWeek || []).map((d) => DAY_LABELS[d]).join(", ")}
            </span>
            <span className="text-slate-600">·</span>
            <span>{auto.timezone}</span>
            {platformLabels.length > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <span className="truncate">{platformLabels.join(", ")}</span>
              </>
            )}
          </div>

          {lastRun && (
            <div className="mt-2.5 flex items-start gap-1.5 text-[11px]">
              {lastRun.status === "published" ? (
                <FiCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
              ) : lastRun.status === "partial" ? (
                <FiAlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
              ) : (
                <FiX className="mt-0.5 h-3 w-3 shrink-0 text-rose-400" />
              )}
              <span className="text-slate-500">
                Last run {new Date(lastRun.runAt).toLocaleString()}
                {lastRun.error && (
                  <span className="text-rose-400/80"> — {lastRun.error}</span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton title="Preview" onClick={onPreview} disabled={busy}>
            <FiEye className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            title={auto.enabled ? "Pause" : "Resume"}
            onClick={onToggle}
            disabled={busy}
          >
            {auto.enabled ? (
              <FiPause className="h-3.5 w-3.5" />
            ) : (
              <FiPlay className="h-3.5 w-3.5" />
            )}
          </IconButton>
          <IconButton title="Edit" onClick={onEdit} disabled={busy}>
            <FiEdit2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Delete" onClick={onDelete} disabled={busy} danger>
            <FiTrash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, title, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-ghost h-8 w-8 min-h-0 rounded-lg p-0 ${
        danger ? "btn-ghost-danger" : ""
      }`}
    >
      {children}
    </button>
  );
}

function FormModal({
  form,
  setForm,
  connected,
  fbPages,
  saving,
  error,
  isNew,
  onSave,
  onClose,
}) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  function togglePlatform(id) {
    setForm((f) => ({
      ...f,
      platforms: { ...f.platforms, [id]: !f.platforms[id] },
    }));
  }

  function togglePage(pageId) {
    setForm((f) => ({
      ...f,
      pageIds: f.pageIds.includes(pageId)
        ? f.pageIds.filter((p) => p !== pageId)
        : [...f.pageIds, pageId],
    }));
  }

  function toggleDay(day) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter((d) => d !== day)
        : [...f.daysOfWeek, day].sort(),
    }));
  }

  // Escape to close, matching the AI writer dialog. Bound here rather than on
  // the panel so it works without the dialog holding focus.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // .ai-overlay / .ai-panel are the app's dialog surfaces — they read from the
    // theme tokens, so this panel turns light with the rest of the UI. Styling
    // it with raw slate/white utilities (as this first did) leaves a dark panel
    // under light-theme text, which is unreadable.
    <div
      className="ai-overlay items-start overflow-y-auto py-8"
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? "New automation" : "Edit automation"}
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop dismisses —
        // a drag that ends outside a text field shouldn't close the form.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ai-panel max-w-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ai-panel-head">
          <div className="ai-glow" aria-hidden />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="ai-chip">
                <FiZap className="h-3.5 w-3.5" /> Autopilot
              </span>
              <h2 className="mt-2.5 text-[1.35rem] font-bold leading-tight tracking-tight text-white">
                {isNew ? "New automation" : "Edit automation"}
              </h2>
              <p className="pretty mt-1 text-sm text-slate-400">
                Runs on its own, on the schedule you set below.
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

        <div className="ai-panel-body space-y-5">
          <Field label="Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Morning tip"
              className="field text-sm"
            />
          </Field>

          <Field
            label="What should it post about?"
            hint="This same brief is used every run — keep it general, not tied to a date."
          >
            <textarea
              value={form.prompt}
              onChange={(e) => set({ prompt: e.target.value })}
              rows={3}
              placeholder="Share a short, practical productivity tip for small business owners"
              className="field resize-y text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => set({ prompt: ex })}
                  className="ai-example text-left"
                >
                  {ex.slice(0, 38)}…
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Language">
              <Select
                value={form.language}
                onChange={(v) => set({ language: v })}
                options={WRITE_LANGUAGES}
              />
            </Field>
            <Field label="Tone">
              <Select
                value={form.tone}
                onChange={(v) => set({ tone: v })}
                options={WRITE_TONES}
              />
            </Field>
            <Field label="Length">
              <Select
                value={form.length}
                onChange={(v) => set({ length: v })}
                options={WRITE_LENGTHS}
              />
            </Field>
          </div>

          <div className="flex gap-4">
            <Checkbox
              checked={form.hashtags}
              onChange={(v) => set({ hashtags: v })}
              label="Hashtags"
            />
            <Checkbox
              checked={form.emojis}
              onChange={(v) => set({ emojis: v })}
              label="Emoji"
            />
          </div>

          <Field label="Publish to">
            <div className="space-y-2">
              {PLATFORMS.map((p) => {
                const isConnected = connected[p.id];
                return (
                  <label
                    key={p.id}
                    className={`surface-row flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isConnected ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.platforms[p.id] && isConnected}
                      disabled={!isConnected}
                      onChange={() => togglePlatform(p.id)}
                      className="h-3.5 w-3.5 accent-rose-500"
                    />
                    <p.Icon className={`h-4 w-4 ${p.accent}`} />
                    <span className="text-slate-200">{p.label}</span>
                    {!isConnected && (
                      <span className="ml-auto text-[10px] text-slate-500">
                        Not connected
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {form.platforms.facebook && connected.facebook && (
              <div className="surface-row mt-2 space-y-1.5 rounded-lg p-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Facebook Pages
                </p>
                {fbPages.length === 0 ? (
                  <p className="text-xs text-slate-500">No Pages found.</p>
                ) : (
                  fbPages.map((page) => (
                    <label
                      key={page.id}
                      className="flex cursor-pointer items-center gap-2 text-xs text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={form.pageIds.includes(page.id)}
                        onChange={() => togglePage(page.id)}
                        className="h-3 w-3 accent-rose-500"
                      />
                      {page.name}
                    </label>
                  ))
                )}
              </div>
            )}

            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              Instagram and YouTube need an image or video, so they aren&apos;t available
              for text-only automations.
            </p>
          </Field>

          <Field label="When">
            <div className="flex gap-2">
              <Select
                value={form.frequency}
                onChange={(v) => set({ frequency: v })}
                options={[
                  { value: "daily", label: "Every day" },
                  { value: "weekly", label: "Certain days" },
                ]}
              />
              <input
                type="time"
                value={form.timeOfDay}
                onChange={(e) => set({ timeOfDay: e.target.value })}
                className="field w-auto text-sm"
              />
            </div>

            {form.frequency === "weekly" && (
              <div className="mt-2 flex gap-1">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={form.daysOfWeek.includes(day)}
                    className={`day-chip flex-1 ${
                      form.daysOfWeek.includes(day) ? "is-active" : ""
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
              <FiCalendar className="h-3 w-3" />
              {form.timezone} · usually goes out within an hour of this time
            </p>
          </Field>

          {error && (
            <div className="note note-danger" role="alert">
              <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="ai-panel-foot">
          <button type="button" onClick={onClose} className="btn btn-ghost text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn btn-autopilot text-xs"
          >
            {saving && <FiLoader className="h-3.5 w-3.5 animate-spin" />}
            {isNew ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ preview, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ai-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview — ${preview.name}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ai-panel max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ai-panel-head">
          <div className="ai-glow" aria-hidden />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="ai-chip">
                <FiEye className="h-3.5 w-3.5" /> Preview
              </span>
              <h2 className="mt-2.5 truncate text-[1.35rem] font-bold leading-tight tracking-tight text-white">
                {preview.name}
              </h2>
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

        <div className="ai-panel-body">
          {preview.loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <FiLoader className="h-4 w-4 animate-spin" />
              Writing a sample post…
            </div>
          ) : preview.error ? (
            <div className="note note-danger" role="alert">
              <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {preview.error}
            </div>
          ) : (
            <>
              <div className="surface-row whitespace-pre-wrap rounded-lg px-3.5 py-3 text-sm leading-relaxed text-slate-200">
                {preview.text}
              </div>
              <p className="mt-3 text-[10px] text-slate-500">
                A sample only — this wasn&apos;t published, and each real run writes
                something new.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-300">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="field text-sm"
    >
      {options.map((o) => (
        // The dropdown list is painted by the OS, not the panel, so it needs
        // its own colours — without them light theme renders dark-on-dark.
        <option
          key={o.value}
          value={o.value}
          style={{ background: "var(--background)", color: "var(--text-body)" }}
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-rose-500"
      />
      {label}
    </label>
  );
}
