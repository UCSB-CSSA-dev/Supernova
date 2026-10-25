"use client";

import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
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
import { Clock, LoaderCircle, TriangleAlert, UserX } from "lucide-react";
import Link from "next/link";
import { ADS, AdPoster, AdSlot } from "@/components/ad-slot";
import { SignedInAs } from "@/components/google-sign-in";
import { LoadingDots, StatusHeader } from "@/components/status-header";
import { BackendError, castVote, fetchVoteState } from "@/lib/backend";
import { describeWindow } from "@/lib/format";
import type { Choice } from "@/lib/ranking";
import type { NotOpen, UserSession, VoteResult, VoteState as ServerVoteState } from "@/lib/types";

// opensLocally is the scheduled opening converted to this phone's clock.
type Waiting = NotOpen & { opensLocally: number | null };

type VoteState =
  | { status: "loading"; retryAt: number | null }
  | { status: "error"; message: string }
  | Exclude<ServerVoteState, NotOpen>
  | Waiting;

type Submission = { phase: "sending"; choice: Choice } | { phase: "failed"; choice: Choice; message: string };

// While voting has not opened, the page checks again on its own so nobody has to refresh.
// Hundreds of phones wait on this page, so checks are spread out to stay under Apps Script's concurrency limit.
const WAITING_POLL_MS = 45000;
const WAITING_JITTER_MS = 15000;
// Stop checking this long before a scheduled opening; the phone opens the ballot by itself instead.
const LOCAL_SWITCH_MARGIN_MS = 10000;
// Covers clock estimates that are off by the request's travel time, so early votes aren't rejected.
const OPEN_SAFETY_MS = 1500;
// When everyone opens the ballot at once Google can turn requests away; the page keeps trying, backing off
// and spreading phones out, instead of giving up.
const BUSY_RETRY_MS = [3000, 6000, 10000, 15000, 20000];
const BUSY_JITTER_MS = 4000;
// Extra rounds on top of castVote's own retries before the vote screen asks the person to try again.
const SUBMIT_ROUNDS = 3;
// The sponsor ad shown while a vote is sent stays up at least this long.
const MIN_SUBMIT_MS = 5000;

function busyDelay(attempt: number): number {
  return BUSY_RETRY_MS[Math.min(attempt, BUSY_RETRY_MS.length - 1)] + Math.random() * BUSY_JITTER_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function castVoteUntilAnswered(token: string, choice: Choice): Promise<VoteResult> {
  for (let round = 0; ; round += 1) {
    try {
      return await castVote(token, choice.singerName, choice.songName);
    } catch (error) {
      if (!(error instanceof BackendError && error.busy) || round >= SUBMIT_ROUNDS) throw error;
      await sleep(busyDelay(round));
    }
  }
}

export function VoteScreen({ session }: { session: UserSession }) {
  const [state, setState] = useState<VoteState>({ status: "loading", retryAt: null });
  const [loadKey, setLoadKey] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [ballotNote, setBallotNote] = useState<string | null>(null);
  const mounted = useRef(true);
  const opensLocally = state.status === "notOpen" ? state.opensLocally : null;
  const waitingFor =
    state.status === "notOpen" && state.window.phase !== "closed" ? (state.window.opensAt ?? "unscheduled") : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function load(attempt: number) {
      try {
        const payload = await fetchVoteState(session.token);
        if (active) setState(receive(payload));
      } catch (error) {
        if (!active) return;
        if (error instanceof BackendError && error.busy) {
          const wait = busyDelay(attempt);
          setState({ status: "loading", retryAt: Date.now() + wait });
          timer = window.setTimeout(() => void load(attempt + 1), wait);
          return;
        }
        setState({ status: "error", message: error instanceof Error ? error.message : "Voting is temporarily unavailable." });
      }
    }
    void load(0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [session.token, loadKey]);

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

  function reload() {
    setState({ status: "loading", retryAt: null });
    setLoadKey((count) => count + 1);
  }

  const selectedChoice =
    state.status === "open"
      ? state.candidates.find((choice) => choiceValue(choice) === selected) ?? null
      : null;

  async function submitVote(choice: Choice) {
    setConfirmOpen(false);
    setBallotNote(null);
    setSubmission({ phase: "sending", choice });
    const started = Date.now();
    let finish: () => void;
    try {
      const payload = await castVoteUntilAnswered(session.token, choice);
      finish = () => {
        setSubmission(null);
        if (payload.status === "voted") {
          setState({ status: "used", singerName: payload.singerName, songName: payload.songName });
        } else if (payload.status === "unknownChoice") {
          setSelected(null);
          setBallotNote("That performance is no longer on the list. Pick again from the updated ballot.");
          reload();
        } else {
          setState(receive(payload));
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The vote could not be sent.";
      finish = () => setSubmission({ phase: "failed", choice, message });
    }
    await sleep(Math.max(0, MIN_SUBMIT_MS - (Date.now() - started)));
    if (mounted.current) finish();
  }

  if (submission || state.status === "used") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-4">
        {submission?.phase === "sending" ? (
          <StatusHeader tone="working" label="Submitting your vote">
            <p className="truncate text-sm">
              <span className="font-medium">{submission.choice.singerName}</span>
              <span className="text-muted-foreground"> · {submission.choice.songName}</span>
              <LoadingDots />
            </p>
          </StatusHeader>
        ) : submission?.phase === "failed" ? (
          <StatusHeader tone="error" label="Vote not sent">
            <p className="text-sm">{submission.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void submitVote(submission.choice)}>
                Try again
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSubmission(null)}>
                Back to ballot
              </Button>
            </div>
          </StatusHeader>
        ) : state.status === "used" ? (
          <StatusHeader tone="done" label="Vote recorded">
            <p className="truncate text-sm">
              <span className="font-medium">{state.singerName}</span>
              <span className="text-muted-foreground"> · {state.songName}</span>
            </p>
          </StatusHeader>
        ) : null}
        <AdPoster ad="poster" className="mt-4" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
      <p className="text-sm tracking-[0.35em] text-primary uppercase">Supernova</p>
      <h1 className="mt-2 font-heading text-4xl">Cast your vote</h1>
      <SignedInAs session={session} />

      {state.status === "loading" ? <BallotLoading retryAt={state.retryAt} onRetry={reload} /> : null}

      {state.status === "error" ? (
        <div className="mt-8 space-y-3">
          <p className="text-destructive">{state.message}</p>
          <Button variant="outline" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : null}

      {state.status === "unregistered" ? (
        <section className="mt-8 flex gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <UserX className="mt-0.5 size-6 shrink-0 text-destructive" />
          <div>
            <p className="text-lg">You haven&apos;t checked in.</p>
            <p className="mt-1 text-muted-foreground">
              Only people who checked in while check-in was open can vote. If you checked in with a different account,
              tap Switch above.
            </p>
            <Link href="/check-in" className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Check in
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
          <PreloadPoster />
          {ballotNote ? <p className="mb-4 text-sm text-destructive">{ballotNote}</p> : null}
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this vote?</AlertDialogTitle>
            <AlertDialogDescription>
              You are voting for {selectedChoice?.singerName} — {selectedChoice?.songName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AdSlot />
          <AlertDialogFooter className="sm:flex-wrap">
            {/* First in the DOM so the footer's mobile flex-col-reverse puts it at the bottom. */}
            <p
              role="note"
              className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 ring-1 ring-amber-400/30 sm:order-last sm:basis-full"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              Your vote option CANNOT be changed after submitting!
            </p>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => selectedChoice && void submitVote(selectedChoice)}>Submit vote</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

// Fetch the submitting-screen ad while people pick, so it's already there when they submit.
function PreloadPoster() {
  preload(ADS.poster.src.src, { as: "image" });
  return null;
}

// Shown while the ballot loads, including while Google is too busy and the page is waiting to try again.
function BallotLoading({ retryAt, onRetry }: { retryAt: number | null; onRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [started] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const slow = now - started > 5000;
  const seconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null;

  return (
    <section className="mt-8 rounded-xl bg-card p-5 ring-1 ring-foreground/10" aria-live="polite" aria-busy>
      <div className="flex items-center gap-3">
        <LoaderCircle className="size-6 shrink-0 animate-spin text-primary" />
        <p className="text-lg">
          Loading the ballot
          <LoadingDots />
        </p>
      </div>
      {retryAt !== null || slow ? (
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Lots of people are voting right now, so this can take a little while. Keep this page open
            {seconds !== null ? (seconds > 0 ? ` — trying again in ${seconds}s.` : " — trying again now.") : "."}
          </p>
          {retryAt !== null ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try now
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
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
