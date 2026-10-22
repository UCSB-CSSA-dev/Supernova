"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CircleCheck, Clock, TriangleAlert, UserX } from "lucide-react";
import Link from "next/link";
import { AdPoster, AdSlot } from "@/components/ad-slot";
import { SignedInAs } from "@/components/google-sign-in";
import { castVote, fetchVoteState } from "@/lib/backend";
import { describeWindow } from "@/lib/format";
import type { Choice } from "@/lib/ranking";
import type { NotOpen, UserSession, VoteState as ServerVoteState } from "@/lib/types";

// opensLocally is the scheduled opening converted to this phone's clock.
type Waiting = NotOpen & { opensLocally: number | null };

type VoteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | Exclude<ServerVoteState, NotOpen>
  | Waiting;

// While voting has not opened, the page checks again on its own so nobody has to refresh.
// Hundreds of phones wait on this page, so checks are spread out to stay under Apps Script's concurrency limit.
const WAITING_POLL_MS = 45000;
const WAITING_JITTER_MS = 15000;
// Stop checking this long before a scheduled opening; the phone opens the ballot by itself instead.
const LOCAL_SWITCH_MARGIN_MS = 10000;
// Covers clock estimates that are off by the request's travel time, so early votes aren't rejected.
const OPEN_SAFETY_MS = 1500;

function receive(payload: ServerVoteState): VoteState {
  if (payload.status !== "notOpen") return payload;
  const opensAt = payload.window.opensAt ? Date.parse(payload.window.opensAt) : Number.NaN;
  const scheduled = payload.window.phase === "scheduled" && payload.candidates && !Number.isNaN(opensAt);
  return {
    ...payload,
    opensLocally: scheduled ? opensAt - (payload.serverTime - Date.now()) + OPEN_SAFETY_MS : null,
  };
}

function choiceValue(choice: Choice): string {
  return `${choice.singerName}\u0000${choice.songName}`;
}

export function VoteScreen({ session }: { session: UserSession }) {
  const [state, setState] = useState<VoteState>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const opensLocally = state.status === "notOpen" ? state.opensLocally : null;
  const waitingFor =
    state.status === "notOpen" && state.window.phase !== "closed" ? (state.window.opensAt ?? "unscheduled") : null;

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const payload = await fetchVoteState(session.token);
        if (active) setState(receive(payload));
      } catch (error) {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Voting is temporarily unavailable." });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [session.token]);

  useEffect(() => {
    if (state.status !== "notOpen" || state.opensLocally === null || !state.candidates) return;
    const candidates = state.candidates;
    const timer = window.setTimeout(
      () => setState({ status: "open", candidates }),
      Math.max(0, state.opensLocally - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [state]);

  // Picks up schedule changes while waiting. Without a scheduled time, this is how the phone learns voting opened.
  useEffect(() => {
    if (!waitingFor) return;
    let active = true;
    let timer: number | undefined;
    function schedule() {
      const delay = WAITING_POLL_MS + Math.random() * WAITING_JITTER_MS;
      if (opensLocally !== null && Date.now() + delay > opensLocally - LOCAL_SWITCH_MARGIN_MS) return;
      timer = window.setTimeout(() => {
        fetchVoteState(session.token)
          .then((payload) => {
            if (active) setState(receive(payload));
          })
          .catch(() => undefined)
          .finally(() => {
            if (active) schedule();
          });
      }, delay);
    }
    schedule();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [waitingFor, opensLocally, session.token]);

  const selectedChoice =
    state.status === "open"
      ? state.candidates.find((choice) => choiceValue(choice) === selected) ?? null
      : null;

  async function submitVote() {
    if (!selectedChoice || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = await castVote(session.token, selectedChoice.singerName, selectedChoice.songName);
      if (payload.status === "unknownChoice") {
        setSubmitError("That performance is no longer on the list.");
        return;
      }
      setConfirmOpen(false);
      if (payload.status === "voted") {
        setState({ status: "used", singerName: payload.singerName, songName: payload.songName });
      } else {
        setState(receive(payload));
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "The vote could not be saved. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === "used") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-4">
        <header
          className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
          aria-live="polite"
        >
          <CircleCheck className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.3em] text-primary uppercase">Supernova · Vote recorded</p>
            <p className="truncate text-sm">
              <span className="font-medium">{state.singerName}</span>
              <span className="text-muted-foreground"> · {state.songName}</span>
            </p>
          </div>
        </header>
        <AdPoster className="mt-4" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
      <p className="text-sm tracking-[0.35em] text-primary uppercase">Supernova</p>
      <h1 className="mt-2 font-heading text-4xl">Cast your vote</h1>
      <SignedInAs session={session} />

      {state.status === "loading" ? <p className="mt-8 text-muted-foreground">Loading the ballot…</p> : null}

      {state.status === "error" ? <p className="mt-8 text-destructive">{state.message}</p> : null}

      {state.status === "unregistered" ? (
        <section className="mt-8 flex gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <UserX className="mt-0.5 size-6 shrink-0 text-destructive" />
          <div>
            <p className="text-lg">You haven&apos;t checked in.</p>
            <p className="mt-1 text-muted-foreground">
              Only people who scanned the check-in code at the venue can vote. If you checked in with a different
              account, tap Switch above.
            </p>
            <Link href="/check-in" className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline">
              How to check in
            </Link>
          </div>
        </section>
      ) : null}

      {state.status === "notOpen" ? (
        <section className="mt-8 flex gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10" aria-live="polite">
          <Clock className="mt-0.5 size-6 shrink-0 text-primary" />
          <div>
            {state.opensLocally !== null ? <OpensIn at={state.opensLocally} /> : null}
            <p className={state.opensLocally !== null ? "mt-1 text-muted-foreground" : "text-lg"}>
              {describeWindow(state.window, "Voting")}
            </p>
            <p className="mt-1 text-muted-foreground">
              {state.window.phase === "closed"
                ? "Thanks for coming to Supernova!"
                : "You're checked in. Keep this page open and the ballot will appear when voting opens."}
            </p>
          </div>
        </section>
      ) : null}

      {state.status === "open" ? (
        <form
          className="mt-6 flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedChoice) setConfirmOpen(true);
          }}
        >
          {state.candidates.length === 0 ? (
            <p className="text-muted-foreground">The performers are not listed yet.</p>
          ) : (
            <RadioGroup
              value={selected ?? ""}
              onValueChange={(value) => setSelected(value)}
              className="gap-3"
            >
              {state.candidates.map((choice) => {
                const value = choiceValue(choice);
                const active = selected === value;
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${active ? "ring-2 ring-primary" : ""}`}
                  >
                    <RadioGroupItem value={value} />
                    <span className="min-w-0">
                      <span className="block font-heading text-xl">{choice.singerName}</span>
                      <span className="block text-sm text-muted-foreground">{choice.songName}</span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          )}

          <div className="sticky bottom-0 mt-6 -mx-4 bg-background/95 px-4 py-4 backdrop-blur">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={!selectedChoice}>
              Vote
            </Button>
          </div>
        </form>
      ) : null}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!submitting) {
            setConfirmOpen(open);
            if (!open) setSubmitError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this vote?</AlertDialogTitle>
            <AlertDialogDescription>
              You are voting for {selectedChoice?.singerName} — {selectedChoice?.songName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AdSlot />
          {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
          <AlertDialogFooter className="sm:flex-wrap">
            {/* First in the DOM so the footer's mobile flex-col-reverse puts it at the bottom. */}
            <p
              role="note"
              className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 ring-1 ring-amber-400/30 sm:order-last sm:basis-full"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              Your vote option CANNOT be changed after submitting!
            </p>
            <AlertDialogCancel disabled={submitting}>Go back</AlertDialogCancel>
            <AlertDialogAction disabled={submitting} onClick={() => void submitVote()}>
              {submitting ? "Submitting…" : "Submit vote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function OpensIn({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const total = Math.max(0, Math.ceil((at - now) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  const clock = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
  return (
    <p className="font-heading text-lg">
      Voting opens in <span className="text-2xl text-primary tabular-nums">{clock}</span>
    </p>
  );
}
