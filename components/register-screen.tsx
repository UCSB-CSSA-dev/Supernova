"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleCheck, Clock } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { SignedInAs } from "@/components/google-sign-in";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { register } from "@/lib/backend";
import { describeWindow, formatWhen } from "@/lib/format";
import type { TimeWindow, UserSession } from "@/lib/types";

// While check-in hasn't opened, the page asks again at least this often, and spreads the retries
// out so phones left open on this page don't all hit Google the moment it opens.
const MAX_WAIT_MS = 60000;
const JITTER_MS = 15000;

type Phase =
  | { status: "loading" }
  | { status: "closed"; window: TimeWindow }
  | { status: "registered"; registeredAt: string; already: boolean; voting?: TimeWindow }
  | { status: "error"; message: string };

export function CheckinPage() {
  return <AuthGate>{(session) => <RegisterScreen key={session.token} session={session} />}</AuthGate>;
}

function RegisterScreen({ session }: { session: UserSession }) {
  const token = session.token;
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    function fail(caught: unknown) {
      if (active) setPhase({ status: "error", message: caught instanceof Error ? caught.message : "Check-in failed." });
    }
    async function run() {
      const result = await register(token);
      if (!active) return;
      if (result.status !== "registered" && result.status !== "closed") {
        throw new Error("Check-in isn't available right now. Ask an admin to redeploy the Apps Script.");
      }
      setPhase(result);
      if (result.status === "registered") return;
      const opensAt = result.window.phase === "scheduled" && result.window.opensAt ? Date.parse(result.window.opensAt) : NaN;
      if (Number.isNaN(opensAt)) return;
      const wait = Math.min(Math.max(opensAt - Date.now(), 0), MAX_WAIT_MS) + Math.random() * JITTER_MS;
      timer = window.setTimeout(() => void run().catch(fail), wait);
    }
    run().catch(fail);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [token, attempt]);

  return (
    <PageShell title="Check in">
      {phase.status !== "registered" ? <SignedInAs session={session} /> : null}

      {phase.status === "loading" ? <p className="mt-8 text-muted-foreground">Checking you in…</p> : null}

      {phase.status === "closed" ? (
        <Notice icon={<Clock className="size-6 text-muted-foreground" />}>
          <p className="text-lg">{describeWindow(phase.window, "Check-in")}</p>
          {phase.window.phase === "scheduled" ? (
            <p className="mt-1 text-muted-foreground">Keep this page open and you&apos;ll be checked in automatically when it opens.</p>
          ) : null}
        </Notice>
      ) : null}

      {phase.status === "registered" ? (
        <section className="mt-8 rounded-xl bg-card p-6 text-center ring-1 ring-primary/40" aria-live="polite">
          <CircleCheck className="mx-auto size-12 text-primary" />
          <p className="mt-3 font-heading text-2xl">{phase.already ? "You're already checked in" : "You're checked in!"}</p>
          <p className="mt-2 font-medium">{session.name}</p>
          <p className="text-sm text-muted-foreground">{session.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">Checked in {formatWhen(phase.registeredAt)}</p>
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
