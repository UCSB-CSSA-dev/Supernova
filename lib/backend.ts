import type { AdminStatus, PublicResults, SendBatchResult, SendMode, VoteState } from "@/lib/types";

const TOKEN_KEY = "supernova-admin-token";

export class BackendError extends Error {
  unauthenticated: boolean;

  constructor(message: string, unauthenticated = false) {
    super(message);
    this.name = "BackendError";
    this.unauthenticated = unauthenticated;
  }
}

function endpoint(): string {
  const url = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL?.trim();
  if (!url) {
    throw new BackendError("Set NEXT_PUBLIC_APPS_SCRIPT_URL to the deployed Apps Script web app URL.");
  }
  return url;
}

type Payload = Record<string, unknown> & { ok?: boolean; error?: string; unauthenticated?: boolean };

async function call<T>(payload: Record<string, unknown>, timeoutMs?: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      redirect: "follow",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new BackendError("Google took too long to answer.");
    }
    throw error;
  }
  const text = await response.text();
  let body: Payload;
  try {
    body = JSON.parse(text) as Payload;
  } catch {
    throw new BackendError("Google Apps Script did not return JSON. Redeploy the web app and use its /exec URL.");
  }
  if (!body || typeof body !== "object") throw new BackendError("Empty response from Google.");
  if (body.unauthenticated) throw new BackendError(body.error || "Not authenticated", true);
  if (body.ok === false && body.error && body.error !== "used" && body.error !== "invalid" && body.error !== "unknown-choice") {
    throw new BackendError(body.error);
  }
  return body as T;
}

export function adminToken(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function saveAdminToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
}

// The results board waits for each answer before asking again, so a stalled request must not hang forever.
export function fetchResults(): Promise<PublicResults> {
  return call<PublicResults>({ action: "results" }, 15000);
}

export function fetchVoteState(code: string): Promise<VoteState & { ok?: boolean; error?: string }> {
  return call({ action: "voteState", code });
}

export function castVote(code: string, singerName: string, songName: string): Promise<{
  ok?: boolean;
  error?: string;
  singerName?: string;
  songName?: string;
}> {
  return call({ action: "vote", code, singerName, songName });
}

export async function login(password: string): Promise<void> {
  const body = await call<{ ok?: boolean; token?: string; error?: string }>({ action: "login", password });
  if (!body.token) throw new BackendError(body.error || "Wrong password.");
  saveAdminToken(body.token);
}

export async function logout(): Promise<void> {
  const token = adminToken();
  clearAdminToken();
  if (!token) return;
  await call({ action: "logout", token }).catch(() => undefined);
}

export function fetchAdminStatus(): Promise<AdminStatus> {
  return call<AdminStatus>({ action: "status", token: adminToken() });
}

export function generateCodes(): Promise<{ created: number }> {
  return call({ action: "codes", token: adminToken() });
}

export function sendTestEmail(subject: string, message: string): Promise<{ ok: boolean }> {
  return call({ action: "testEmail", token: adminToken(), subject, message });
}

export function sendBatch(
  subject: string,
  message: string,
  skipRows: number[],
  mode: SendMode,
): Promise<SendBatchResult> {
  return call({ action: "send", token: adminToken(), subject, message, skipRows, mode });
}

export function startResend(): Promise<{ total: number }> {
  return call({ action: "resendStart", token: adminToken() });
}

export function cancelResend(): Promise<{ ok: boolean }> {
  return call({ action: "resendCancel", token: adminToken() });
}
