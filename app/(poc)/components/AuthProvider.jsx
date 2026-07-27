"use client";

import { createContext, useContext, useEffect, useState } from "react";

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
  const [loading, setLoading] = useState(true);

  const user = auth?.user ?? null;
  const token = auth?.token ?? null;

  useEffect(() => {
    setLoading(false);
  }, []);

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

  function logout() {
    setAuth(null);
    writeStoredAuth(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
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
