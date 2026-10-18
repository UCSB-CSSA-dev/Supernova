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
import { CircleCheck, TriangleAlert } from "lucide-react";
import { AdPoster, AdSlot } from "@/components/ad-slot";
import { castVote, fetchVoteState } from "@/lib/backend";
import type { Choice } from "@/lib/ranking";

type VoteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "invalid" }
  | { status: "used"; singerName: string; songName: string }
  | { status: "open"; candidates: Choice[] };

function choiceValue(choice: Choice): string {
  return `${choice.singerName}\u0000${choice.songName}`;
}

export function VoteScreen({ code }: { code: string }) {
  const [state, setState] = useState<VoteState>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const payload = await fetchVoteState(code);
        if (!active) return;
        if (payload.status === "invalid") setState({ status: "invalid" });
        else if (payload.status === "used" && payload.singerName && payload.songName) {
          setState({ status: "used", singerName: payload.singerName, songName: payload.songName });
        } else if (payload.status === "open" && Array.isArray(payload.candidates)) {
          setState({ status: "open", candidates: payload.candidates });
        } else {
          setState({ status: "error", message: payload.error ?? "Voting is temporarily unavailable." });
        }
      } catch (error) {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Voting is temporarily unavailable." });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [code]);

  const selectedChoice =
    state.status === "open"
      ? state.candidates.find((choice) => choiceValue(choice) === selected) ?? null
      : null;

  async function submitVote() {
    if (!selectedChoice || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = await castVote(code, selectedChoice.singerName, selectedChoice.songName);
      if (payload.error === "used" && payload.singerName && payload.songName) {
        setConfirmOpen(false);
        setState({ status: "used", singerName: payload.singerName, songName: payload.songName });
        return;
      }
      if (payload.error === "invalid") {
        setConfirmOpen(false);
        setState({ status: "invalid" });
        return;
      }
      if (payload.ok === false) {
        setSubmitError("That performance is no longer on the list.");
        return;
      }
      setConfirmOpen(false);
      setState({
        status: "used",
        singerName: selectedChoice.singerName,
        songName: selectedChoice.songName,
      });
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

      {state.status === "loading" ? <p className="mt-8 text-muted-foreground">Loading the ballot…</p> : null}

      {state.status === "error" ? <p className="mt-8 text-destructive">{state.message}</p> : null}

      {state.status === "invalid" ? (
        <p className="mt-8 text-lg">This voting link is not valid.</p>
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
