"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Mic, RefreshCw, RotateCcw } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { SignedInAs } from "@/components/google-sign-in";
import { MailReveal, hasSeenMail } from "@/components/mail-reveal";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimOrder, fetchOrderState } from "@/lib/backend";
import type { OrderState, UserSession } from "@/lib/types";
import { cn } from "@/lib/utils";

// The numbers keep spinning at least this long, even if Google answers sooner.
const MIN_SPIN_MS = 1800;
// Matches ORDER_NAME_MAX in Code.gs.
const NAME_MAX = 40;
const NOT_SINGER =
  "Only finalists can pick a singing order. If you're performing, sign in with the @ucsb.edu email you gave the organizers, or ask them to add you.";

export function RandomOrderScreen() {
  return <AuthGate>{(session) => <RandomOrder key={session.token} session={session} />}</AuthGate>;
}

function RandomOrder({ session }: { session: UserSession }) {
  const [order, setOrder] = useState<OrderState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"mail" | "order">("mail");
  // Each replay remounts the letter so it starts from the mailbox again.
  const [reveal, setReveal] = useState(() => ({ run: 0, autoplay: !hasSeenMail(session.email) }));
  const [revealEnded, setRevealEnded] = useState(!reveal.autoplay);
  const [name, setName] = useState(session.name);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [reel, setReel] = useState<number | null>(null);
  const [justClaimed, setJustClaimed] = useState(false);
  const mounted = useRef(true);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    fetchOrderState(session.token)
      .then((body) => {
        if (mounted.current) setOrder(body);
      })
      .catch((caught: unknown) => {
        if (mounted.current) setLoadError(caught instanceof Error ? caught.message : "Could not load the singing order.");
      });
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, [session.token]);

  async function refresh() {
    setRefreshing(true);
    try {
      const body = await fetchOrderState(session.token);
      if (mounted.current) setOrder(body);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Could not refresh.");
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (spinning || !order) return;
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      setError("Enter your name.");
      return;
    }
    setSpinning(true);
    setError(null);
    const taken = new Set(order.lineup.map((slot) => slot.number));
    const open = Array.from({ length: order.size }, (_, index) => index + 1).filter((number) => !taken.has(number));
    const pool = open.length > 0 ? open : [order.size];
    const started = Date.now();
    const request = claimOrder(session.token, trimmed);
    let settled = false;
    request.then(
      () => (settled = true),
      () => (settled = true),
    );

    await new Promise<void>((resolve) => {
      let delay = 60;
      function tick() {
        if (!mounted.current) return resolve();
        setReel(pool[Math.floor(Math.random() * pool.length)]);
        if (settled && Date.now() - started >= MIN_SPIN_MS) delay *= 1.25;
        if (delay > 320) return resolve();
        timer.current = window.setTimeout(tick, delay);
      }
      tick();
    });

    try {
      const body = await request;
      if (!mounted.current) return;
      setOrder(body);
      if (body.status === "full") setError(`All ${body.size} spots are taken.`);
      if (body.status === "notSinger") setError(NOT_SINGER);
      setJustClaimed(body.status === "claimed");
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Could not get a number. Try again.");
    } finally {
      if (mounted.current) {
        setSpinning(false);
        setReel(null);
      }
    }
  }

  function replay() {
    window.scrollTo(0, 0);
    setReveal((current) => ({ run: current.run + 1, autoplay: true }));
    setRevealEnded(false);
    setView("mail");
  }

  const mine = order?.mine ?? null;
  const replayButton =
    view === "order" || revealEnded ? (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: view === "mail" ? 1.5 : 0 }}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40"
      >
        <Button variant="secondary" className="rounded-full shadow-lg ring-1 ring-foreground/10" onClick={replay}>
          <RotateCcw className="size-4" />
          重播
        </Button>
      </motion.div>
    ) : null;

  if (view === "mail") {
    return (
      <MotionConfig reducedMotion="user">
        <MailReveal
          key={reveal.run}
          name={session.name}
          email={session.email}
          autoplay={reveal.autoplay}
          qualified={order ? order.allowed : null}
          error={loadError}
          claimed={Boolean(mine)}
          onEnd={() => setRevealEnded(true)}
          onRoll={() => {
            window.scrollTo(0, 0);
            setView("order");
          }}
        />
        {replayButton}
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      {replayButton}
      <PageShell title="Singing Order (Finals)" className="max-w-2xl pb-24">
        <SignedInAs session={session} />

        {loadError ? <p className="mt-6 text-destructive">{loadError}</p> : null}
        {!order && !loadError ? <p className="mt-6 text-muted-foreground">Loading the singing order…</p> : null}

        {order ? (
          <section className="mt-8 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <AnimatePresence mode="wait">
              {mine ? (
                <motion.div
                  key="mine"
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 15 }}
                  className="text-center"
                >
                  <p className="text-sm tracking-[0.3em] text-muted-foreground uppercase">Your singing order</p>
                  <p className="mt-3 font-heading text-[clamp(5rem,22vw,9rem)] leading-none font-bold text-amber-200 drop-shadow-[0_0_30px_oklch(0.84_0.16_85/0.6)]">
                    #{mine.number}
                  </p>
                  <p className="mt-3 text-lg">{mine.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {justClaimed ? "Saved. " : ""}This is your number and it can&apos;t be changed.
                  </p>
                </motion.div>
              ) : spinning ? (
                <motion.div key="reel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                  <p className="text-sm tracking-[0.3em] text-muted-foreground uppercase">Picking your number…</p>
                  <p className="mt-3 font-heading text-[clamp(5rem,22vw,9rem)] leading-none font-bold text-foreground/80 tabular-nums">
                    {reel ?? "?"}
                  </p>
                </motion.div>
              ) : !order.allowed ? (
                <motion.div key="not-singer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <Mic className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <p className="text-muted-foreground">{NOT_SINGER}</p>
                </motion.div>
              ) : order.remaining === 0 ? (
                <motion.p key="full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                  All {order.size} spots are taken.
                </motion.p>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onSubmit={(event) => void onSubmit(event)}
                >
                  <div className="flex items-center gap-3">
                    <Mic className="size-5 text-primary" />
                    <p>
                      Get a random number from 1 to {order.size}. Each number goes to one person, and you only get one.
                    </p>
                  </div>
                  <Label htmlFor="order-name" className="mt-5 block">
                    Your name
                  </Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="order-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="The name you perform under"
                      maxLength={NAME_MAX}
                      autoComplete="name"
                      required
                    />
                    <Button type="submit" disabled={!name.trim()}>
                      Get my number
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{order.remaining} of {order.size} numbers left.</p>
                </motion.form>
              )}
            </AnimatePresence>
            {error ? <p className="mt-4 text-center text-destructive">{error}</p> : null}
          </section>
        ) : null}

        {order && order.size > 0 ? (
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm tracking-[0.3em] text-primary uppercase">Lineup</h2>
              <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={refreshing}>
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
            <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: order.size }, (_, index) => {
                const number = index + 1;
                const slot = order.lineup.find((item) => item.number === number);
                return (
                  <li
                    key={number}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 ring-1",
                      mine?.number === number
                        ? "bg-primary/15 ring-primary/70"
                        : slot
                          ? "bg-card ring-foreground/10"
                          : "ring-foreground/5",
                    )}
                  >
                    <span className="w-7 font-heading text-primary tabular-nums">{number}</span>
                    <span className={cn("min-w-0 truncate text-sm", !slot && "text-muted-foreground/50")}>
                      {slot ? slot.name : "Open"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
      </PageShell>
    </MotionConfig>
  );
}
