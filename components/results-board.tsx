"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, animate, motion, useMotionValue, useTransform } from "motion/react";
import { Crown } from "lucide-react";
import { fetchResults } from "@/lib/backend";
import { choiceKey, type RankedChoice } from "@/lib/ranking";
import { diffRankings } from "@/lib/results-diff";
import type { PublicResults } from "@/lib/types";
import { cn } from "@/lib/utils";

const FEATURED = 5;
const SYNC_MS = 1000;
const SWEEP_GAP_MS = 2500;

const BAR_STYLES = [
  { bar: "from-amber-500 via-amber-300 to-yellow-100", glow: "oklch(0.84 0.16 85 / 0.55)", medal: "text-amber-300" },
  { bar: "from-slate-500 via-slate-300 to-white", glow: "oklch(0.9 0.02 260 / 0.4)", medal: "text-slate-200" },
  { bar: "from-orange-700 via-orange-400 to-amber-200", glow: "oklch(0.7 0.15 55 / 0.45)", medal: "text-orange-300" },
  { bar: "from-indigo-700 via-violet-500 to-fuchsia-300", glow: "oklch(0.6 0.2 300 / 0.4)", medal: "text-violet-300" },
  { bar: "from-indigo-800 via-indigo-500 to-sky-300", glow: "oklch(0.6 0.15 260 / 0.4)", medal: "text-sky-300" },
];

type Burst = { id: number; key: string };
type Gain = { id: number; key: string; amount: number };
type Leader = { id: number; singerName: string; songName: string };

export function ResultsBoard() {
  const [results, setResults] = useState<PublicResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncCount, setSyncCount] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [flips, setFlips] = useState<Record<string, number>>({});
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [gains, setGains] = useState<Gain[]>([]);
  const [sweep, setSweep] = useState(0);
  const [leader, setLeader] = useState<Leader | null>(null);
  const previous = useRef<RankedChoice[] | null>(null);
  const nextId = useRef(0);
  const lastSweep = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const pending = new Set<number>();

    function later(run: () => void, ms: number) {
      const handle = window.setTimeout(() => {
        pending.delete(handle);
        if (active) run();
      }, ms);
      pending.add(handle);
    }

    function celebrate(next: RankedChoice[]) {
      const prev = previous.current;
      previous.current = next;
      if (!prev) return;
      const events = diffRankings(prev, next, FEATURED);

      if (events.moved.length > 0) {
        setFlips((current) => {
          const copy = { ...current };
          for (const key of events.moved) copy[key] = (copy[key] ?? 0) + 1;
          return copy;
        });
        // Under heavy voting the order shifts every sync; a constant sweep is just noise.
        if (Date.now() - lastSweep.current > SWEEP_GAP_MS) {
          lastSweep.current = Date.now();
          setSweep((count) => count + 1);
        }
      }
      for (const key of events.climbed) {
        const id = ++nextId.current;
        // Wait until the bars cross mid-swap before the impact.
        later(() => setBursts((current) => [...current, { id, key }]), 320);
        later(() => setBursts((current) => current.filter((burst) => burst.id !== id)), 1700);
      }
      for (const gain of events.gains) {
        const id = ++nextId.current;
        setGains((current) => [...current.filter((item) => item.key !== gain.key), { id, ...gain }]);
        later(() => setGains((current) => current.filter((item) => item.id !== id)), 1800);
      }
      if (events.newLeader) {
        const choice = next.find((item) => choiceKey(item) === events.newLeader);
        if (choice) {
          const id = ++nextId.current;
          setLeader({ id, singerName: choice.singerName, songName: choice.songName });
          later(() => setLeader((current) => (current?.id === id ? null : current)), 4000);
        }
      }
    }

    async function sync() {
      const started = Date.now();
      try {
        const body = await fetchResults();
        if (!active) return;
        if (!Array.isArray(body.ranked)) throw new Error("The results could not be loaded.");
        celebrate(body.ranked);
        setResults(body);
        setError(null);
        setLastSync(Date.now());
        setSyncCount((count) => count + 1);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "The results could not be loaded.");
      }
      if (active) timer = window.setTimeout(() => void sync(), Math.max(0, SYNC_MS - (Date.now() - started)));
    }

    void sync();
    return () => {
      active = false;
      window.clearTimeout(timer);
      for (const handle of pending) window.clearTimeout(handle);
    };
  }, []);

  const ranked = results?.ranked ?? [];
  const featured = ranked.slice(0, FEATURED);
  const rest = ranked.slice(FEATURED);
  const topVotes = Math.max(1, featured[0]?.votes ?? 0);

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative isolate flex h-dvh flex-col overflow-hidden px-[3vw] pt-[2.5vh] pb-[3vh]">
        <Backdrop />

        <AnimatePresence>
          {sweep > 0 ? (
            <motion.div
              key={sweep}
              aria-hidden
              className="sn-sweep pointer-events-none absolute inset-0 z-30"
              initial={{ x: "-110%" }}
              animate={{ x: "110%" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
            />
          ) : null}
        </AnimatePresence>

        <div className="pointer-events-none absolute inset-x-0 top-[2.5vh] z-40 flex justify-center">
          <AnimatePresence>
            {leader ? (
              <motion.div
                key={leader.id}
                initial={{ y: -90, opacity: 0, scale: 0.85 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -60, opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="flex items-center gap-4 rounded-full border border-amber-300/50 bg-black/70 px-7 py-3 shadow-[0_0_60px_oklch(0.84_0.16_85/0.45)] backdrop-blur"
              >
                <Crown className="size-7 text-amber-300" />
                <div>
                  <p className="text-xs font-semibold tracking-[0.35em] text-amber-300 uppercase">New leader</p>
                  <p className="font-heading text-[clamp(1.2rem,3vh,2rem)] leading-tight">
                    {leader.singerName} <span className="text-muted-foreground">· {leader.songName}</span>
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <header className="flex items-start justify-between gap-6 pb-[2vh]">
          <div>
            <p className="text-sm tracking-[0.4em] text-primary uppercase">Live results</p>
            <h1 className="sn-title font-heading text-[clamp(2.6rem,6vw,5.5rem)] leading-none font-bold">Supernova</h1>
          </div>
          <div className="flex items-start gap-[2vw]">
            <div className="text-right">
              <p className="font-heading text-[clamp(2rem,4.5vw,4.5rem)] leading-none tabular-nums">
                {results ? <AnimatedNumber value={results.totalVotes} /> : "–"}
              </p>
              <p className="mt-1 text-xs tracking-[0.3em] text-muted-foreground uppercase">Total votes</p>
            </div>
            <SyncIndicator syncCount={syncCount} lastSync={lastSync} error={error} />
          </div>
        </header>

        {!results && !error ? <p className="text-lg text-muted-foreground">Loading the board…</p> : null}
        {!results && error ? <p className="max-w-xl text-lg text-destructive">{error}</p> : null}
        {results && ranked.length === 0 ? (
          <p className="text-xl text-muted-foreground">Add performers to the singer spreadsheet to start the board.</p>
        ) : null}

        {featured.length > 0 ? (
          <div
            className="grid min-h-0 flex-1 gap-[2.5vw]"
            style={{ gridTemplateColumns: rest.length > 0 ? "minmax(0, 1fr) minmax(15rem, 22vw)" : "minmax(0, 1fr)" }}
          >
            <LayoutGroup>
              <section className="relative flex min-h-0 items-stretch gap-[1.6vw] perspective-[1400px]">
                <AnimatePresence initial={false} mode="popLayout">
                  {featured.map((choice) => {
                    const key = choiceKey(choice);
                    return (
                      <BarColumn
                        key={key}
                        choice={choice}
                        topVotes={topVotes}
                        flips={flips[key] ?? 0}
                        bursts={bursts.filter((burst) => burst.key === key)}
                        gains={gains.filter((gain) => gain.key === key)}
                      />
                    );
                  })}
                </AnimatePresence>
              </section>
            </LayoutGroup>

            {rest.length > 0 ? <RestList rest={rest} gains={gains} /> : null}
          </div>
        ) : null}
      </main>
    </MotionConfig>
  );
}

function BarColumn({
  ref,
  choice,
  topVotes,
  flips,
  bursts,
  gains,
}: {
  ref?: Ref<HTMLElement>;
  choice: RankedChoice;
  topVotes: number;
  flips: number;
  bursts: Burst[];
  gains: Gain[];
}) {
  const style = BAR_STYLES[choice.place - 1] ?? BAR_STYLES[BAR_STYLES.length - 1];
  const height = choice.votes === 0 ? 2.5 : Math.max(4, (choice.votes / topVotes) * 100);
  const leading = choice.place === 1 && choice.votes > 0;

  return (
    <motion.article
      ref={ref}
      layout
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 60, transition: { duration: 0.3 } }}
      transition={{ layout: { type: "spring", stiffness: 230, damping: 26 } }}
      className="flex min-w-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col pt-[11vh]">
        <div className="relative min-h-0 flex-1">
          <motion.div
            className="absolute inset-x-0 bottom-0"
            initial={{ height: "0%" }}
            animate={{ height: `${height}%` }}
            transition={{ type: "spring", stiffness: 70, damping: 16 }}
          >
            <div className="absolute inset-x-0 bottom-full flex flex-col items-center pb-[1vh]">
              <AnimatePresence>
                {gains.map((gain) => (
                  <motion.span
                    key={gain.id}
                    className="absolute bottom-full left-1/2 z-20 -translate-x-1/2 rounded-full bg-emerald-400 px-[0.6em] py-[0.15em] font-heading text-[clamp(1rem,3vh,2rem)] font-bold whitespace-nowrap text-emerald-950 shadow-[0_0_28px_oklch(0.8_0.18_150/0.8)]"
                    initial={{ y: 20, opacity: 0, scale: 0.5 }}
                    animate={{ y: -50, opacity: [0, 1, 1, 0], scale: [0.5, 1.15, 1, 1] }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 1.7, ease: "easeOut" }}
                  >
                    +{gain.amount}
                  </motion.span>
                ))}
              </AnimatePresence>
              {leading ? (
                <motion.div
                  animate={{ y: [0, -6, 0], rotate: [-6, 6, -6] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Crown className="size-[clamp(1.5rem,4vh,2.75rem)] text-amber-300 drop-shadow-[0_0_12px_oklch(0.84_0.16_85)]" />
                </motion.div>
              ) : null}
              <p className="font-heading text-[clamp(1.8rem,5.5vh,4.75rem)] leading-none font-bold tabular-nums">
                <AnimatedNumber value={choice.votes} />
              </p>
            </div>

            <motion.div
              animate={{ rotateY: flips * 360 }}
              transition={{ duration: 0.9, ease: [0.3, 0.9, 0.3, 1] }}
              className={cn("sn-bar relative h-full rounded-t-2xl bg-linear-to-t", style.bar)}
              style={{ boxShadow: `0 0 ${leading ? 70 : 40}px ${style.glow}`, transformStyle: "preserve-3d" }}
            >
              {leading ? <div className="sn-pulse absolute inset-0 rounded-t-2xl" /> : null}
            </motion.div>

            {bursts.map((burst) => (
              <Impact key={burst.id} />
            ))}
          </motion.div>
        </div>
      </div>

      <div className="mt-[1.6vh] flex h-[15vh] shrink-0 flex-col items-center overflow-hidden text-center">
        <p className={cn("font-heading text-[clamp(1.4rem,4vh,3rem)] leading-none font-bold", style.medal)}>
          #{choice.place}
        </p>
        <h2 className="mt-[0.6vh] line-clamp-2 font-heading text-[clamp(1rem,2.8vh,2rem)] leading-tight font-semibold">
          {choice.singerName}
        </h2>
        <p className="line-clamp-1 text-[clamp(0.8rem,1.8vh,1.25rem)] text-muted-foreground">{choice.songName}</p>
      </div>
    </motion.article>
  );
}

const SPARKS = Array.from({ length: 16 }, (_, index) => ({
  angle: (index / 16) * 360,
  distance: 70 + ((index * 37) % 60),
  length: 10 + ((index * 13) % 14),
}));

function Impact() {
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 -right-[0.8vw] z-30">
      <motion.span
        className="absolute size-24 -translate-1/2 rounded-full bg-[radial-gradient(circle,white,oklch(0.9_0.15_85/0.8)_35%,transparent_70%)] mix-blend-screen"
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 2.6, opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      <motion.span
        className="absolute size-16 -translate-1/2 rounded-full border-2 border-amber-200"
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      {SPARKS.map((spark) => (
        <span key={spark.angle} className="absolute" style={{ transform: `rotate(${spark.angle}deg)` }}>
          <motion.span
            className="absolute block w-[3px] -translate-x-1/2 rounded-full bg-linear-to-t from-transparent to-amber-100"
            style={{ height: spark.length }}
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -spark.distance, opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.1, 0.8, 0.3, 1] }}
          />
        </span>
      ))}
    </div>
  );
}

function RestList({ rest, gains }: { rest: RankedChoice[]; gains: Gain[] }) {
  return (
    <aside className="flex max-h-full min-h-0 flex-col self-start rounded-2xl border border-white/8 bg-white/3 p-[1.2vw] backdrop-blur-sm">
      <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">Also in the running</p>
      <ul className="relative mt-[1.2vh] min-h-0 flex-1 space-y-[0.4vh] overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {rest.map((choice) => {
            const key = choiceKey(choice);
            const gained = gains.filter((gain) => gain.key === key).at(-1);
            return (
              <motion.li
                key={key}
                layout
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ layout: { type: "spring", stiffness: 320, damping: 32 } }}
                className="relative grid grid-cols-[2.5ch_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-lg px-2 py-[0.7vh] text-[clamp(0.8rem,1.7vh,1.1rem)]"
              >
                {gained ? (
                  <motion.span
                    key={gained.id}
                    className="absolute inset-0 bg-emerald-400/20"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.4 }}
                  />
                ) : null}
                <span className="font-heading text-muted-foreground tabular-nums">{choice.place}</span>
                <span className="min-w-0">
                  <span className="block truncate text-foreground/85">{choice.singerName}</span>
                  <span className="block truncate text-[0.8em] text-muted-foreground/70">{choice.songName}</span>
                </span>
                <span className="font-heading text-foreground/80 tabular-nums">
                  <AnimatedNumber value={choice.votes} />
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </aside>
  );
}

function SyncIndicator({ syncCount, lastSync, error }: { syncCount: number; lastSync: number | null; error: string | null }) {
  const live = Boolean(lastSync) && !error;
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-full border border-white/10 bg-black/35 py-2 pr-4 pl-3 backdrop-blur"
    >
      <span className="relative flex size-3.5 items-center justify-center">
        {live ? (
          <motion.span
            key={syncCount}
            className="absolute inset-0 rounded-full bg-emerald-400"
            initial={{ scale: 1, opacity: 0.85 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        ) : null}
        <motion.span
          key={`dot-${syncCount}`}
          className={cn(
            "relative size-3.5 rounded-full",
            live ? "bg-emerald-400 shadow-[0_0_14px_oklch(0.8_0.18_150)]" : error ? "bg-red-500" : "bg-amber-400",
          )}
          initial={{ opacity: 0.3, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        />
      </span>
      <span className="leading-tight">
        <span className="block text-xs font-semibold tracking-[0.25em] uppercase">
          {live ? "Live" : error ? "Reconnecting" : "Connecting"}
        </span>
        <span className="block text-[11px] text-muted-foreground tabular-nums">
          {lastSync ? `Synced ${new Date(lastSync).toLocaleTimeString()}` : "Waiting for Google"}
        </span>
      </span>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const count = useMotionValue(0);
  const text = useTransform(count, (latest) => Math.round(latest).toLocaleString());
  useEffect(() => {
    const controls = animate(count, value, { duration: 0.9, ease: "easeOut" });
    return () => controls.stop();
  }, [count, value]);
  return <motion.span>{text}</motion.span>;
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="sn-aurora sn-aurora-a" />
      <div className="sn-aurora sn-aurora-b" />
      <div className="sn-aurora sn-aurora-c" />
      <div className="sn-stars" />
      <div className="sn-stars sn-stars-slow" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-background to-transparent" />
    </div>
  );
}
