import { useSyncExternalStore } from "react";
import type { UserSession } from "@/lib/types";

const SESSION_KEY = "supernova-session";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedSession: UserSession | null = null;

function parse(raw: string | null): UserSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as UserSession;
    if (!value.token || !value.email || typeof value.expiresAt !== "number") return null;
    return value;
  } catch {
    return null;
  }
}

export function getSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SESSION_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parse(raw);
  }
  if (cachedSession && cachedSession.expiresAt <= Date.now()) return null;
  return cachedSession;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function saveSession(session: UserSession): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notify();
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSession(): UserSession | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}