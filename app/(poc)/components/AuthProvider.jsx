"use client";

import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

const STORAGE_KEY = "social_manager_auth";

function readStoredAuth() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStoredAuth(auth) {
  if (typeof window === "undefined") return;
  if (!auth) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => readStoredAuth());

  const user = auth?.user ?? null;
  const token = auth?.token ?? null;

  async function login(email, password) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "login_failed");
    }
    const next = { token: data.token, user: data.user };
    setAuth(next);
    writeStoredAuth(next);
    return data;
  }

  async function signup(name, email, password) {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "signup_failed");
    }
    const next = { token: data.token, user: data.user };
    setAuth(next);
    writeStoredAuth(next);
    return data;
  }

  // `credential` is the ID token Google Identity Services hands the browser.
  // The server verifies it and returns the same { token, user } shape as the
  // email/password routes, so the rest of the app is unaffected.
  async function loginWithGoogle(credential) {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "google_login_failed");
    }
    const next = { token: data.token, user: data.user };
    setAuth(next);
    writeStoredAuth(next);
    return data;
  }

  function logout() {
    setAuth(null);
    writeStoredAuth(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, token, login, signup, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
