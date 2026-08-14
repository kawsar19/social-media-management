"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import GoogleAuth from "../components/GoogleAuth";
import { authErrorMessage } from "../lib/authErrors";
import { FiMail, FiLock, FiArrowRight, FiAlertCircle } from "react-icons/fi";

function LoginForm() {
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/post";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      window.location.href = redirect;
    } catch (err) {
      setError(authErrorMessage(err.message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-rose-500 text-white shadow-lg shadow-violet-500/25">
          <span className="text-sm font-bold">SM</span>
        </div>
        <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-400">Sign in to SocialManager</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl"
      >
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <FiAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <GoogleAuth
          redirect={redirect}
          onError={(code) => setError(authErrorMessage(code))}
        />

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            or
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-300">Email</span>
          <div className="relative">
            <FiMail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
              placeholder="you@example.com"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-300">Password</span>
          <div className="relative">
            <FiLock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
              placeholder="Enter your password"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-rose-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? "Signing in..." : "Sign in"}
          <FiArrowRight className="h-4 w-4" />
        </button>

        <p className="text-center text-xs text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-indigo-300 hover:text-indigo-200">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400" />
            <p className="text-sm text-slate-400">Loading...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
