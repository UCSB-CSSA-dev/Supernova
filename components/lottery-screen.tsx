"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Gift, Sparkles } from "lucide-react";
import { Backdrop } from "@/components/backdrop";
import { Button } from "@/components/ui/button";
import { drawLottery, fetchLotteryState } from "@/lib/backend";
import { maskEmail } from "@/lib/format";
import type { LotteryDraw, LotteryState } from "@/lib/types";
import { cn } from "@/lib/utils";

// The reel keeps spinning at least this long, even if Google answers sooner.
const MIN_SPIN_MS = 2600;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function LotteryScreen() {
  const [state, setState] = useState<LotteryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [reel, setReel] = useState<string | null>(null);
  const [winner, setWinner] = useState<LotteryDraw | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const drawing = useRef(false);

  useEffect(() => {
    mounted.current = true;
    fetchLotteryState()
      .then((body) => {
        if (mounted.current) setState(body);
      })
      .catch((caught: unknown) => {
        if (mounted.current) setError(caught instanceof Error ? caught.message : "Could not load the lottery.");
      });
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  async function draw() {
    if (drawing.current || !state || state.eligible === 0) return;
    drawing.current = true;
    setRolling(true);
    setWinner(null);
    setError(null);
    const pool = shuffle(state.names.length > 0 ? state.names : ["?"]);
    const started = Date.now();
    const request = drawLottery();
    let settled = false;
    request.then(
      () => (settled = true),
      () => (settled = true),
    );

    await new Promise<void>((resolve) => {
      let index = 0;
      let delay = 55;
      function tick() {
        if (!mounted.current) return resolve();
        setReel(pool[index % pool.length]);
        index += 1;
        const slowing = settled && Date.now() - started >= MIN_SPIN_MS;
        if (slowing) delay *= 1.22;
        if (delay > 380) return resolve();
        timer.current = window.setTimeout(tick, delay);
      }
      tick();
    });

    try {
      const body = await request;
      if (!mounted.current) return;
      setState(body);
      setWinner(body.winner);
    } catch (caught) {
      if (!mounted.current) return;
      setReel(null);
      setError(caught instanceof Error ? caught.message : "The draw failed.");
    } finally {
      drawing.current = false;
      if (mounted.current) setRolling(false);
    }
  }

  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) return;
      if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea")) return;
      event.preventDefault();
      void drawRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const history = state ? [...state.draws].reverse() : [];
  const canDraw = Boolean(state && state.eligible > 0) && !rolling;

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative isolate flex h-dvh flex-col overflow-hidden px-[3vw] pt-[2.5vh] pb-[3vh]">
        <Backdrop />
        <Link href="/dashboard" className="absolute top-2 left-4 text-xs text-muted-foreground/60 hover:text-foreground">
          ← Dashboard
        </Link>

        <header className="flex items-start justify-between gap-6 pb-[2vh]">
          <div>
            <p className="text-sm tracking-[0.4em] text-primary uppercase">Lucky draw</p>
            <h1 className="sn-title font-heading text-[clamp(2.6rem,6vw,5.5rem)] leading-none font-bold">Supernova</h1>
          </div>
          {state ? (
            <div className="text-right">
              <p className="font-heading text-[clamp(2rem,4.5vw,4.5rem)] leading-none tabular-nums">{state.eligible}</p>
              <p className="mt-1 text-xs tracking-[0.3em] text-muted-foreground uppercase">
                Still in the draw · {state.registered} checked in
                {state.singers ? ` · ${state.singers} singers` : ""}
              </p>
            </div>
          ) : null}
        </header>

        <div
          className="grid min-h-0 flex-1 gap-[2.5vw]"
          style={{ gridTemplateColumns: history.length > 0 ? "minmax(0, 1fr) minmax(15rem, 24vw)" : "minmax(0, 1fr)" }}
        >
          <section className="flex min-h-0 flex-col items-center justify-center text-center">
            <p className="text-sm tracking-[0.35em] text-muted-foreground uppercase">
              {winner ? `Round ${winner.round} winner` : rolling ? "Drawing…" : `Round ${(state?.draws.length ?? 0) + 1}`}
            </p>
            <div className="relative mt-[3vh] flex min-h-[28vh] w-full items-center justify-center">
              <AnimatePresence mode="wait">
                {winner ? (
                  <motion.div
                    key={`winner-${winner.round}`}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 220, damping: 14 }}
                    className="relative"
                  >
                    <motion.div
                      aria-hidden
                      className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,oklch(0.84_0.16_85/0.55),transparent_65%)] blur-2xl"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1.8, opacity: 1 }}
                      transition={{ duration: 0.9 }}
                    />
                    <Sparkles className="mx-auto size-[clamp(2rem,6vh,4rem)] text-amber-300" />
                    <p className="mt-[1vh] font-heading text-[clamp(3rem,11vh,9rem)] leading-none font-bold text-amber-100 drop-shadow-[0_0_30px_oklch(0.84_0.16_85/0.7)]">
                      {winner.name}
                    </p>
                    <p className="mt-[2vh] font-mono text-[clamp(1.1rem,3.2vh,2.2rem)] text-muted-foreground">
                      {maskEmail(winner.email)}
                    </p>
                  </motion.div>
                ) : reel ? (
                  <p
                    key="reel"
                    className={cn(
                      "font-heading text-[clamp(2.5rem,9vh,7.5rem)] leading-none font-bold",
                      rolling ? "text-foreground/90" : "text-muted-foreground",
                    )}
                  >
                    {reel}
                  </p>
                ) : (
                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Gift className="mx-auto size-[clamp(4rem,14vh,9rem)] text-primary/80" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button
              size="lg"
              className="mt-[5vh] h-[clamp(3rem,7vh,4.5rem)] rounded-full px-[clamp(2rem,5vw,4rem)] font-heading text-[clamp(1.1rem,2.8vh,1.8rem)]"
              onClick={() => void draw()}
              disabled={!canDraw}
            >
              {rolling ? "Drawing…" : winner ? "Draw next" : "Draw"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              {state && state.eligible === 0 && !rolling
                ? state.registered + (state.singers ?? 0) === 0
                  ? "Nobody is in the draw yet."
                  : "Everyone in the draw has been drawn."
                : "Press space to draw. Each person can only win once. Winners claim their prize right after the show."}
            </p>
            {!state && !error ? <p className="mt-4 text-muted-foreground">Loading the lottery…</p> : null}
            {error ? <p className="mt-4 text-destructive">{error}</p> : null}
          </section>

          {history.length > 0 ? (
            <aside className="flex max-h-full min-h-0 flex-col self-start rounded-2xl border border-white/8 bg-white/3 p-[1.2vw] backdrop-blur-sm">
              <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">Winners</p>
              <ul className="mt-[1.2vh] min-h-0 flex-1 space-y-[0.6vh] overflow-auto">
                <AnimatePresence initial={false}>
                  {history.map((draw) => (
                    <motion.li
                      key={draw.round}
                      layout
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="grid grid-cols-[3ch_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-[0.7vh] text-[clamp(0.85rem,1.8vh,1.15rem)]"
                    >
                      <span className="font-heading text-primary tabular-nums">#{draw.round}</span>
                      <span className="min-w-0">
                        <span className="block truncate">{draw.name}</span>
                        <span className="block truncate font-mono text-[0.8em] text-muted-foreground/70">{maskEmail(draw.email)}</span>
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </aside>
          ) : null}
        </div>
      </main>
    </MotionConfig>
  );
}
