import { hasQueuedAdViews, queueAdView, returnAdViews, takeAdViews } from "@/lib/ad-views";
import { forgetGoogleAccount } from "@/lib/google";
import { clearSession, getSession, saveSession } from "@/lib/session";
import type {
  AdminList,
  AdminStatus,
  CheckinStatus,
  LotteryState,
  Me,
  OrderAdminState,
  OrderClaim,
  OrderState,
  PublicResults,
  RegisterResult,
  TimeWindow,
  UserSession,
  VoteResult,
  VoteState,
  WindowName,
} from "@/lib/types";

export class BackendError extends Error {
  unauthenticated: boolean;
  signedOut: boolean;
  // Google was too busy or unreachable; asking again later may work.
  busy: boolean;

  constructor(message: string, options: { unauthenticated?: boolean; signedOut?: boolean; busy?: boolean } = {}) {
    super(message);
    this.name = "BackendError";
    this.unauthenticated = Boolean(options.unauthenticated);
    this.signedOut = Boolean(options.signedOut);
    this.busy = Boolean(options.busy);
  }
}

function endpoint(): string {
  const url = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL?.trim();
  if (!url) {
    throw new BackendError("Set NEXT_PUBLIC_APPS_SCRIPT_URL to the deployed Apps Script web app URL.");
  }
  return url;
}

type Payload = Record<string, unknown> & {
  ok?: boolean;
  error?: string;
  unauthenticated?: boolean;
  signedOut?: boolean;
};

type CallOptions = {
  timeoutMs?: number;
  // Only for requests that are safe to repeat; Apps Script drops requests when hundreds arrive at once.
  retries?: number;
};

class TransientError extends Error {}

async function request(payload: Record<string, unknown>, timeoutMs?: number): Promise<Payload> {
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
      throw new TransientError("Google took too long to answer.");
    }
    if (error instanceof BackendError) throw error;
    throw new TransientError("Could not reach Google. Check your connection.");
  }
  const text = await response.text();
  try {
    const body = JSON.parse(text) as Payload;
    if (!body || typeof body !== "object") throw new TransientError("Empty response from Google.");
    return body;
  } catch (error) {
    if (error instanceof TransientError) throw error;
    throw new TransientError("Google is busy right now. Try again in a moment.");
  }
}

async function call<T>(payload: Record<string, unknown>, options: CallOptions = {}): Promise<T> {
  const retries = options.retries ?? 0;
  // Queued sponsor ad views ride along on whatever request goes out next instead of costing their own.
  const adViews = takeAdViews();
  const sent = adViews.length ? { ...payload, adViews } : payload;
  let body: Payload | null = null;
  for (let attempt = 0; body === null; attempt += 1) {
    try {
      body = await request(sent, options.timeoutMs);
    } catch (error) {
      if (!(error instanceof TransientError) || attempt >= retries) {
        returnAdViews(adViews);
        if (error instanceof TransientError) throw new BackendError(error.message, { busy: true });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1) + Math.random() * 600));
    }
  }
  if (body.signedOut) {
    clearSession();
    throw new BackendError(body.error || "Your sign-in expired. Sign in again.", { signedOut: true });
  }
  if (body.unauthenticated) throw new BackendError(body.error || "Not authenticated", { unauthenticated: true });
  if (body.ok === false) throw new BackendError(body.error || "Something went wrong.");
  return body as T;
}

// ---------- Audience ----------

// An ad view with no request after it (like the poster after voting) is sent on its own, spread out
// over a while so a room full of phones doesn't send them all at once.
const AD_FLUSH_MS = 20000;
const AD_FLUSH_JITTER_MS = 20000;
let adFlushTimer: number | undefined;

export function recordAdView(ad: string): void {
  queueAdView(ad);
  window.clearTimeout(adFlushTimer);
  adFlushTimer = window.setTimeout(() => {
    if (!hasQueuedAdViews()) return;
    call({ action: "adViews", session: getSession()?.token ?? "" }).catch(() => undefined);
  }, AD_FLUSH_MS + Math.random() * AD_FLUSH_JITTER_MS);
}

export async function signIn(credential: string): Promise<UserSession> {
  const body = await call<{ session: string; email: string; name: string; expiresAt: number }>(
    { action: "signIn", credential },
    { retries: 2 },
  );
  const session = { token: body.session, email: body.email, name: body.name, expiresAt: body.expiresAt };
  saveSession(session);
  return session;
}

export function fetchMe(session: string): Promise<Me> {
  return call({ action: "me", session }, { retries: 2 });
}

export function register(session: string): Promise<RegisterResult> {
  return call({ action: "register", session }, { retries: 3 });
}

export function fetchVoteState(session: string): Promise<VoteState> {
  return call({ action: "voteState", session }, { retries: 2 });
}

export function castVote(session: string, singerName: string, songName: string): Promise<VoteResult> {
  return call({ action: "vote", session, singerName, songName }, { retries: 3 });
}

export function fetchOrderState(session: string): Promise<OrderState> {
  return call({ action: "orderState", session }, { retries: 2 });
}

// Safe to retry: the script gives each account one number and returns it again on repeat requests.
export function claimOrder(session: string, name: string): Promise<OrderClaim> {
  return call({ action: "claimOrder", session, name }, { timeoutMs: 30000, retries: 2 });
}

// ---------- Admin ----------

// Admins sign in with the same Google session as the audience; the script checks the email on every request.
function adminSession(): string {
  return getSession()?.token ?? "";
}

export function signOut(): void {
  forgetGoogleAccount();
  clearSession();
}

export function checkAdmin(): Promise<{ email: string; isOwner: boolean }> {
  return call({ action: "adminCheck", session: adminSession() }, { retries: 1 });
}

// The results board waits for each answer before asking again, so a stalled request must not hang forever.
export function fetchResults(): Promise<PublicResults> {
  return call<PublicResults>({ action: "results", session: adminSession() }, { timeoutMs: 15000 });
}

export function fetchAdminStatus(): Promise<AdminStatus> {
  return call<AdminStatus>({ action: "status", session: adminSession() });
}

export async function addAdmin(email: string): Promise<AdminList> {
  const body = await call<{ admins: AdminList }>({ action: "addAdmin", session: adminSession(), email });
  return body.admins;
}

export async function removeAdmin(email: string): Promise<AdminList> {
  const body = await call<{ admins: AdminList }>({ action: "removeAdmin", session: adminSession(), email });
  return body.admins;
}

export async function setWindow(name: WindowName, opensAt: string | null, closesAt: string | null): Promise<TimeWindow> {
  const body = await call<{ window: TimeWindow }>({ action: "setWindow", session: adminSession(), name, opensAt, closesAt });
  return body.window;
}

export function fetchCheckinStatus(): Promise<CheckinStatus> {
  return call({ action: "checkinStatus", session: adminSession() }, { timeoutMs: 15000, retries: 1 });
}

export function fetchLotteryState(): Promise<LotteryState> {
  return call({ action: "lotteryState", session: adminSession() }, { retries: 1 });
}

export function fetchOrderAdmin(): Promise<OrderAdminState> {
  return call({ action: "orderAdmin", session: adminSession() }, { retries: 1 });
}

// Never retried: a repeated request could archive claims made right after the first reset.
export function resetOrder(): Promise<OrderAdminState> {
  return call({ action: "orderReset", session: adminSession() }, { timeoutMs: 30000 });
}

// Never retried: a repeated request could archive check-ins made right after the first reset.
export function resetCheckin(): Promise<{ archived: number }> {
  return call({ action: "checkinReset", session: adminSession() }, { timeoutMs: 30000 });
}

// Never retried: a repeated request could archive votes cast right after the first reset.
export function resetVotes(): Promise<{ archived: number }> {
  return call({ action: "votesReset", session: adminSession() }, { timeoutMs: 30000 });
}

// Never retried: a repeated request could archive a winner drawn right after the first reset.
export function resetLottery(): Promise<LotteryState> {
  return call({ action: "lotteryReset", session: adminSession() }, { timeoutMs: 30000 });
}

// Never retried: a repeated request would draw a second winner.
export function drawLottery(): Promise<LotteryState & { winner: NonNullable<LotteryState["winner"]> }> {
  return call({ action: "lotteryDraw", session: adminSession() }, { timeoutMs: 30000 });
}
