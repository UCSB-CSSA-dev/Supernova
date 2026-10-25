"use client";

import { useEffect, useState, type ReactNode } from "react";
import { preload } from "react-dom";
import { motion } from "motion/react";
import { Clock, Mic } from "lucide-react";
import { ADS, AdPoster } from "@/components/ad-slot";
import { AuthGate } from "@/components/auth-gate";
import { SignedInAs } from "@/components/google-sign-in";
import { PageShell } from "@/components/page-shell";
import { LoadingDots, StatusHeader } from "@/components/status-header";
import { Button } from "@/components/ui/button";
import { register } from "@/lib/backend";
import { describeWindow, formatWhen } from "@/lib/format";
import type { RegisterResult, TimeWindow, UserSession } from "@/lib/types";

// While check-in hasn't opened, the page asks again at least this often, and spreads the retries
// out so phones left open on this page don't all hit Google the moment it opens.
const MAX_WAIT_MS = 60000;
const JITTER_MS = 15000;
// The sponsor ad shown while checking in stays up at least this long.
const MIN_LOADING_MS = 3000;

type Phase =
  | { status: "ready" }
  | { status: "loading" }
  | { status: "closed"; window: TimeWindow }
  | { status: "registered"; registeredAt: string; already: boolean }
  | { status: "singer" }
  | { status: "error"; message: string };

export function CheckinPage() {
  return <AuthGate>{(session) => <RegisterScreen key={session.token} session={session} />}</AuthGate>;
}

async function registerAtLeast(token: string, ms: number): Promise<RegisterResult> {
  const started = Date.now();
  try {
    return await register(token);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms - (Date.now() - started))));
  }
}

function RegisterScreen({ session }: { session: UserSession }) {
  const token = session.token;
  const [phase, setPhase] = useState<Phase>({ status: "ready" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0) return;
    let active = true;
    let timer: number | undefined;
    function fail(caught: unknown) {
      if (active) setPhase({ status: "error", message: caught instanceof Error ? caught.message : "Check-in failed." });
    }
    async function run(minMs: number) {
      const result = await registerAtLeast(token, minMs);
      if (!active) return;
      if (result.status !== "registered" && result.status !== "closed" && result.status !== "singer") {
        throw new Error("Check-in isn't available right now. Ask an admin to redeploy the Apps Script.");
      }
      setPhase(result);
      if (result.status !== "closed") return;
      const opensAt = result.window.phase === "scheduled" && result.window.opensAt ? Date.parse(result.window.opensAt) : NaN;
      if (Number.isNaN(opensAt)) return;
      const wait = Math.min(Math.max(opensAt - Date.now(), 0), MAX_WAIT_MS) + Math.random() * JITTER_MS;
      timer = window.setTimeout(() => void run(0).catch(fail), wait);
    }
    run(MIN_LOADING_MS).catch(fail);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [token, attempt]);

  // Fetch the check-in ad up front so it's already showing when the button is pressed.
  preload(ADS.checkin.src.src, { as: "image" });

  function checkIn() {
    setPhase({ status: "loading" });
    setAttempt((count) => count + 1);
  }

  if (phase.status === "loading" || phase.status === "registered") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-4">
        <StatusHeader
          tone={phase.status === "loading" ? "working" : "done"}
          label={phase.status === "loading" ? "Checking in" : phase.already ? "Already checked in" : "Checked in"}
        >
          {phase.status === "loading" ? (
            <p className="text-sm">
              Signing you in
              <LoadingDots />
            </p>
          ) : (
            <>
              <p className="truncate text-sm">
                <span className="font-medium">{session.name}</span>
                <span className="text-muted-foreground"> · {formatWhen(phase.registeredAt)}</span>
              </p>
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-1 text-xs text-muted-foreground"
              >
                You&apos;re qualified for the lucky draw. If you win, you need to claim your prize right after the show.
              </motion.p>
            </>
          )}
        </StatusHeader>
        <AdPoster ad="checkin" className="mt-4" />
      </main>
    );
  }

  return (
    <PageShell title="Check in">
      <SignedInAs session={session} />

      {phase.status === "ready" ? (
        <>
          <AdPoster ad="welcome" className="mt-8" />
          <div className="mt-auto pt-8">
            <Button size="lg" className="h-12 w-full text-base" onClick={checkIn}>
              Check in
            </Button>
          </div>
        </>
      ) : null}

      {phase.status === "singer" ? (
        <Notice icon={<Mic className="size-6 text-primary" />}>
          <p className="text-lg">Singers can&apos;t check in, but you&apos;re in the lucky draw.</p>
          <p className="mt-1 text-muted-foreground">
            You&apos;re on the singer list, so you&apos;re entered automatically. If you win, claim your prize right after
            the show.
          </p>
        </Notice>
      ) : null}

      {phase.status === "closed" ? (
        <Notice icon={<Clock className="size-6 text-muted-foreground" />}>
          <p className="text-lg">{describeWindow(phase.window, "Check-in")}</p>
          {phase.window.phase === "scheduled" ? (
            <p className="mt-1 text-muted-foreground">Keep this page open and you&apos;ll be checked in automatically when it opens.</p>
          ) : null}
        </Notice>
      ) : null}

      {phase.status === "error" ? (
        <div className="mt-8 space-y-3">
          <p className="text-destructive">{phase.message}</p>
          <Button variant="outline" onClick={checkIn}>
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
