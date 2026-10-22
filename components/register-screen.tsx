"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck, QrCode } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { SignedInAs } from "@/components/google-sign-in";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { fetchCheckinTicket, fetchMe, register } from "@/lib/backend";
import { describeWindow, formatWhen } from "@/lib/format";
import { clearTicket, readTicket, saveTicket } from "@/lib/session";
import type { TimeWindow, UserSession } from "@/lib/types";

type Phase =
  | { status: "loading" }
  | { status: "needCode"; expired: boolean }
  | { status: "closed"; window: TimeWindow }
  | { status: "registered"; registeredAt: string | null; already: boolean; voting: TimeWindow | null }
  | { status: "error"; message: string };

type Claim = { status: "ok"; ticket: string } | { status: "expired" } | { status: "closed"; window: TimeWindow };

// Trades the scanned code for a ticket right away, because the code on screen rotates while people sign in.
async function claimCode(code: string): Promise<Claim> {
  const saved = readTicket();
  if (saved) return { status: "ok", ticket: saved };
  if (!code) return { status: "expired" };
  const result = await fetchCheckinTicket(code);
  if (result.status !== "ok") return result;
  saveTicket(result.ticket, result.expiresAt);
  return { status: "ok", ticket: result.ticket };
}

export function CheckinPage() {
  const code = useSearchParams().get("k")?.trim() ?? "";
  return (
    <AuthGate
      prepare={async () => {
        if (code) await claimCode(code);
      }}
    >
      {(session) => <RegisterScreen key={session.token} session={session} code={code} />}
    </AuthGate>
  );
}

function RegisterScreen({ session, code }: { session: UserSession; code: string }) {
  const token = session.token;
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function run() {
      let ticket: string | null = null;
      let closed: TimeWindow | null = null;
      let expired = false;
      const claim = await claimCode(code);
      if (claim.status === "ok") ticket = claim.ticket;
      else if (claim.status === "closed") closed = claim.window;
      else expired = Boolean(code);
      if (!active) return;

      if (ticket) {
        const result = await register(token, ticket);
        if (!active) return;
        clearTicket();
        if (result.status === "registered") {
          setPhase({ status: "registered", registeredAt: result.registeredAt, already: result.already, voting: null });
          return;
        }
        expired = true;
      }

      // Without a usable ticket, someone who already checked in still sees their confirmation.
      const me = await fetchMe(token);
      if (!active) return;
      if (me.registered) setPhase({ status: "registered", registeredAt: me.registeredAt, already: true, voting: me.voting });
      else if (closed || me.checkin.phase !== "open") setPhase({ status: "closed", window: closed ?? me.checkin });
      else setPhase({ status: "needCode", expired });
    }
    run().catch((caught: unknown) => {
      if (active) setPhase({ status: "error", message: caught instanceof Error ? caught.message : "Check-in failed." });
    });
    return () => {
      active = false;
    };
  }, [code, token, attempt]);

  return (
    <PageShell title="Check in">
      {phase.status !== "registered" ? <SignedInAs session={session} /> : null}

      {phase.status === "loading" ? <p className="mt-8 text-muted-foreground">Checking you in…</p> : null}

      {phase.status === "needCode" ? (
        <Notice icon={<QrCode className="size-6 text-primary" />}>
          {phase.expired ? (
            <>
              <p className="text-lg">That check-in code has expired.</p>
              <p className="mt-1 text-muted-foreground">
                The code on screen changes every 30 seconds. Scan it again and you will be checked in right away.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg">Scan the check-in code on the screen at the venue.</p>
              <p className="mt-1 text-muted-foreground">Checking in is how you get into the audience vote and the lucky draw.</p>
            </>
          )}
        </Notice>
      ) : null}

      {phase.status === "closed" ? (
        <Notice icon={<QrCode className="size-6 text-muted-foreground" />}>
          <p className="text-lg">{describeWindow(phase.window, "Check-in")}</p>
        </Notice>
      ) : null}

      {phase.status === "registered" ? (
        <section className="mt-8 rounded-xl bg-card p-6 text-center ring-1 ring-primary/40" aria-live="polite">
          <CircleCheck className="mx-auto size-12 text-primary" />
          <p className="mt-3 font-heading text-2xl">{phase.already ? "You're already checked in" : "You're checked in!"}</p>
          <p className="mt-2 font-medium">{session.name}</p>
          <p className="text-sm text-muted-foreground">{session.email}</p>
          {phase.registeredAt ? (
            <p className="mt-1 text-xs text-muted-foreground">Checked in {formatWhen(phase.registeredAt)}</p>
          ) : null}
          <p className="mt-5 text-sm text-muted-foreground">
            {phase.voting?.phase === "open"
              ? "Voting is open now."
              : "You're in the lucky draw. Voting opens later in the show. Scan the voting code or open the link when it's announced."}
          </p>
          <Button className="mt-4" nativeButton={false} render={<Link href="/vote" />}>
            Go to voting
          </Button>
        </section>
      ) : null}

      {phase.status === "error" ? (
        <div className="mt-8 space-y-3">
          <p className="text-destructive">{phase.message}</p>
          <Button
            variant="outline"
            onClick={() => {
              setPhase({ status: "loading" });
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8 flex gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="shrink-0 pt-0.5">{icon}</div>
      <div>{children}</div>
    </section>
  );
}
