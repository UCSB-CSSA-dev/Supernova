"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { Crown, Heart, Medal, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Backdrop } from "@/components/backdrop";
import { Button } from "@/components/ui/button";
import { fetchFinalResult } from "@/lib/backend";
import { createSfx, type Sfx } from "@/lib/sfx";
import type { FinalAward, FinalAwards } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORDER: FinalAward[] = ["bronze", "silver", "popular", "gold"];
const PODIUM: FinalAward[] = ["silver", "gold", "bronze"];
// Sweep, lock and hold add up to the ~5 second reveal.
const SWEEP_MS = 3300;
const LOCK_MS = 900;
const HOLD_MS = 800;
const REDUCED_HOLD_MS = 1200;
// Names already loaded are used if fresh ones haven't arrived this long after the sweep.
const STALE_WAIT_MS = 1500;
const BURST_MS = 1800;
// Fractions of the screen width.
const BEAM_SOURCES = [0.18, 0.82];

type Phase = "idle" | "sweep" | "lock" | "hold" | "burst";

type AwardStyle = {
  label: string;
  place: string | null;
  icon: ComponentType<{ className?: string }>;
  text: string;
  glow: string;
  face: string;
  height: string;
  sparks: string[];
};

const AWARDS: Record<FinalAward, AwardStyle> = {
  gold: {
    label: "Gold",
    place: "1",
    icon: Crown,
    text: "text-amber-200",
    glow: "oklch(0.84 0.16 85 / 0.8)",
    face: "from-amber-200 via-amber-400 to-amber-700",
    height: "clamp(8rem, 34vh, 22rem)",
    sparks: ["#f6c453", "#fff4d6", "#ffd86b"],
  },
  silver: {
    label: "Silver",
    place: "2",
    icon: Medal,
    text: "text-slate-100",
    glow: "oklch(0.92 0.02 260 / 0.7)",
    face: "from-white via-slate-300 to-slate-600",
    height: "clamp(6rem, 25vh, 16rem)",
    sparks: ["#e2e8f0", "#ffffff", "#94a3b8"],
  },
  bronze: {
    label: "Bronze",
    place: "3",
    icon: Medal,
    text: "text-orange-200",
    glow: "oklch(0.72 0.15 55 / 0.75)",
    face: "from-orange-200 via-orange-400 to-orange-800",
    height: "clamp(4.5rem, 18vh, 12rem)",
    sparks: ["#fb923c", "#fed7aa", "#c2410c"],
  },
  popular: {
    label: "Popular",
    place: null,
    icon: Heart,
    text: "text-fuchsia-200",
    glow: "oklch(0.7 0.22 330 / 0.75)",
    face: "from-fuchsia-300 via-fuchsia-500 to-violet-800",
    height: "clamp(5.5rem, 22vh, 14rem)",
    sparks: ["#f0abfc", "#e879f9", "#c4b5fd"],
  },
};

export function FinalResultScreen() {
  const reduce = useReducedMotion();
  const [names, setNames] = useState<FinalAwards | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Names are kept as they were at release, so a later edit on /admin can't change a revealed name.
  const [revealed, setRevealed] = useState<Partial<FinalAwards>>({});
  const [active, setActive] = useState<FinalAward | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const beamRefs = useRef<(HTMLDivElement | null)[]>([]);
  const namesRef = useRef<FinalAwards | null>(null);
  const settled = useRef(false);
  const request = useRef(0);
  const sfxRef = useRef<Sfx | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchFinalResult()
      .then((body) => {
        if (!mounted) return;
        namesRef.current = body.awards;
        setNames(body.awards);
      })
      .catch((caught: unknown) => {
        if (mounted) setLoadError(caught instanceof Error ? caught.message : "Could not load the final result.");
      });
    return () => {
      mounted = false;
      sfxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    sfxRef.current?.setMuted(muted);
  }, [muted]);

  const next = ORDER.find((award) => revealed[award] === undefined) ?? null;
  const canRelease = Boolean(next) && !active && Boolean(names || loadError);

  function release() {
    if (!canRelease || !next) return;
    if (!sfxRef.current) {
      sfxRef.current = createSfx();
      sfxRef.current?.setMuted(muted);
    }
    const id = ++request.current;
    settled.current = false;
    // Read again at every release so a name fixed on /admin a moment ago is the one revealed.
    fetchFinalResult()
      .then((body) => {
        if (id !== request.current) return;
        namesRef.current = body.awards;
        setNames(body.awards);
        setLoadError(null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (id === request.current) settled.current = true;
      });
    setError(null);
    setActive(next);
    setPhase(reduce ? "hold" : "sweep");
  }

  const releaseRef = useRef(release);
  useEffect(() => {
    releaseRef.current = release;
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const activation = event.code === "Space" || event.code === "Enter";
      if (!activation && event.code !== "ArrowRight" && event.code !== "PageDown") return;
      if (event.repeat) return;
      // A focused button already handles space and enter itself.
      if (activation && event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea")) return;
      event.preventDefault();
      releaseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    const overlay = overlayRef.current;
    if (!active || !main || !overlay) return;
    const award = active;
    const sfx = sfxRef.current;
    const timers: number[] = [];
    let frame = 0;

    function measure() {
      const box = main!.getBoundingClientRect();
      const points = ORDER.map((key) => {
        const rect = main!.querySelector(`[data-final-slot="${key}"]`)?.getBoundingClientRect();
        return rect
          ? { key, x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top, width: rect.width }
          : { key, x: box.width / 2, y: box.height / 2, width: box.width / 6 };
      });
      const xs = points.map((point) => point.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const target = points.find((point) => point.key === award)!;
      const short = Math.min(box.width, box.height);
      return {
        width: box.width,
        height: box.height,
        midX: (minX + maxX) / 2,
        spanX: (maxX - minX) / 2 + box.width * 0.04,
        midY: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        target,
        wide: short * 0.17,
        tight: Math.max(target.width * 0.62, short * 0.1),
      };
    }

    function place(x: number, y: number, r: number, width: number) {
      overlay!.style.setProperty("--spot-x", `${x}px`);
      overlay!.style.setProperty("--spot-y", `${y}px`);
      overlay!.style.setProperty("--spot-r", `${r}px`);
      BEAM_SOURCES.forEach((source, index) => {
        const beam = beamRefs.current[index];
        if (!beam) return;
        const dx = x - source * width;
        const dy = y + 12;
        const angle = (-Math.atan2(dx, dy) * 180) / Math.PI;
        beam.style.height = `${Math.hypot(dx, dy)}px`;
        beam.style.width = `${r * 2}px`;
        beam.style.transform = `translateX(-50%) rotate(${angle}deg)`;
      });
    }

    function ready(elapsed: number) {
      return settled.current || (namesRef.current !== null && elapsed >= SWEEP_MS + STALE_WAIT_MS);
    }

    function reveal() {
      const latest = namesRef.current;
      if (!latest) {
        sfx?.fall();
        setError("Could not load the names from Google. Check the connection and press Release again.");
        setActive(null);
        setPhase("idle");
        return;
      }
      sfx?.crash();
      setRevealed((current) => ({ ...current, [award]: latest[award] }));
      setPhase("burst");
      timers.push(
        window.setTimeout(() => {
          setActive(null);
          setPhase("idle");
        }, BURST_MS),
      );
    }

    const start = performance.now();

    if (reduce) {
      const geo = measure();
      place(geo.target.x, geo.target.y, geo.tight, geo.width);
      const poll = window.setInterval(() => {
        if (performance.now() - start < REDUCED_HOLD_MS || !ready(performance.now() - start)) return;
        window.clearInterval(poll);
        reveal();
      }, 100);
      return () => {
        window.clearInterval(poll);
        timers.forEach((timer) => window.clearTimeout(timer));
      };
    }

    let last = start;
    let sweep = 0;
    let rollAt = sfx ? sfx.now() : 0;
    let spot = { x: 0, y: 0, r: 0 };
    let lock: { start: number; x: number; y: number; r: number } | null = null;
    let holding = false;

    function step(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const geo = measure();
      let intensity = 1;

      if (!lock) {
        const progress = Math.min(1, (now - start) / SWEEP_MS);
        intensity = progress;
        sweep += dt * (1.2 + 4.2 * progress * progress);
        spot = {
          x: geo.midX + geo.spanX * Math.sin(sweep + 0.4 * Math.sin(sweep * 0.7)),
          y: geo.midY + geo.height * 0.1 * Math.sin(sweep * 1.7 + 1),
          r: geo.wide,
        };
        if (progress >= 1 && ready(now - start)) {
          lock = { start: now, ...spot };
          setPhase("lock");
        }
      } else if (!holding) {
        const done = Math.min(1, (now - lock.start) / LOCK_MS);
        const eased = 1 - Math.pow(1 - done, 3);
        spot = {
          x: lock.x + (geo.target.x - lock.x) * eased,
          y: lock.y + (geo.target.y - lock.y) * eased,
          r: lock.r + (geo.tight - lock.r) * eased,
        };
        if (done >= 1) {
          holding = true;
          setPhase("hold");
          sfx?.thump();
          timers.push(window.setTimeout(() => sfx?.thump(), HOLD_MS / 2));
          timers.push(window.setTimeout(reveal, HOLD_MS));
        }
      } else {
        spot = { x: geo.target.x, y: geo.target.y, r: geo.tight };
      }

      if (sfx && !holding) {
        rollAt = Math.max(rollAt, sfx.now());
        while (rollAt < sfx.now() + 0.12) {
          sfx.snare(rollAt, 0.08 + 0.32 * intensity);
          rollAt += 0.11 - 0.065 * intensity;
        }
      }
      place(spot.x, spot.y, spot.r, geo.width);
      frame = window.requestAnimationFrame(step);
    }

    frame = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, reduce]);

  const spotOn = phase === "sweep" || phase === "lock" || phase === "hold";
  const caption = active && spotOn ? `And the ${AWARDS[active].label} award goes to…` : null;
  const spotProps = (award: FinalAward) => ({
    award,
    name: revealed[award],
    holding: phase === "hold" && active === award,
    bursting: phase === "burst" && active === award,
  });

  return (
    <MotionConfig reducedMotion="user">
      <main ref={mainRef} className="relative isolate flex h-dvh flex-col overflow-hidden px-[3vw] pt-[2.5vh] pb-[3vh]">
        <Backdrop />
        <Link href="/dashboard" className="absolute top-2 left-4 z-40 text-xs text-muted-foreground/60 hover:text-foreground">
          ← Dashboard
        </Link>
        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          className="absolute top-3 right-4 z-40 rounded-full bg-black/30 p-2 text-white/60 ring-1 ring-white/15 hover:text-white"
          aria-label={muted ? "Turn sound on" : "Mute"}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>

        <header>
          <p className="text-sm tracking-[0.4em] text-primary uppercase">Final result</p>
          <h1 className="sn-title font-heading text-[clamp(2.6rem,6vw,5.5rem)] leading-none font-bold">Supernova</h1>
        </header>

        <div className="pointer-events-none absolute inset-x-0 top-[13vh] z-30 flex justify-center px-[3vw] text-center">
          <AnimatePresence mode="wait">
            {caption ? (
              <motion.p
                key={caption}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4 }}
                className="font-heading text-[clamp(1.6rem,4.5vh,3rem)] text-white drop-shadow-[0_0_20px_rgb(255_240_200/0.5)]"
              >
                {caption}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <section className="flex min-h-0 flex-1 items-end justify-center gap-[3.5vw] pb-[9vh]">
          <div className="flex items-end gap-[1vw]">
            {PODIUM.map((award) => (
              <Spot key={award} {...spotProps(award)} />
            ))}
          </div>
          <div aria-hidden className="h-[55vh] w-px self-end bg-linear-to-t from-white/25 to-transparent" />
          <Spot {...spotProps("popular")} />
        </section>

        <div
          ref={overlayRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-20 transition-opacity duration-700",
            spotOn ? "opacity-100" : "opacity-0",
          )}
          style={{
            background:
              "radial-gradient(circle var(--spot-r, 0px) at var(--spot-x, 50%) var(--spot-y, 50%), transparent 0%, transparent 60%, rgb(4 3 12 / 0.9) 100%)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
          {BEAM_SOURCES.map((source, index) => (
            <div key={source} className="absolute -top-3" style={{ left: `${source * 100}%` }}>
              <div
                ref={(element) => {
                  beamRefs.current[index] = element;
                }}
                className={cn(
                  "absolute top-0 left-0 origin-top transition-opacity duration-500",
                  spotOn ? "opacity-100" : "opacity-0",
                )}
                style={{
                  clipPath: "polygon(47% 0, 53% 0, 100% 100%, 0 100%)",
                  background: "linear-gradient(to bottom, rgb(255 244 214 / 0.55), rgb(255 236 190 / 0.12) 85%, transparent)",
                  mixBlendMode: "screen",
                }}
              />
              <div
                className={cn(
                  "absolute -top-1 left-0 size-7 -translate-x-1/2 rounded-full bg-stone-700 ring-2 ring-stone-500 transition-shadow duration-500",
                  spotOn && "shadow-[0_0_24px_8px_rgb(255_240_200/0.5)]",
                )}
              />
            </div>
          ))}
        </div>
        {phase === "burst" ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.7 }}
          />
        ) : null}

        <div className="absolute right-[3vw] bottom-[3vh] z-40 flex items-center gap-3">
          {Object.keys(revealed).length > 0 && !active ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setRevealed({})}>
              <RotateCcw className="size-4" />
              Reset
            </Button>
          ) : null}
          <Button
            size="lg"
            className="h-[clamp(3rem,7vh,4.5rem)] rounded-full px-[clamp(1.75rem,3.5vw,3rem)] font-heading text-[clamp(1.05rem,2.6vh,1.6rem)]"
            onClick={release}
            disabled={!canRelease}
          >
            {active ? "Releasing…" : next ? `Release ${AWARDS[next].label}` : "All released"}
          </Button>
        </div>
        <div className="absolute bottom-[3vh] left-[3vw] z-40 max-w-[50vw] text-sm">
          {error || loadError ? (
            <p className="text-destructive">{error ?? loadError}</p>
          ) : !names ? (
            <p className="text-muted-foreground">Loading the final result…</p>
          ) : next && !active ? (
            <p className="text-muted-foreground/60">Press space or → to release.</p>
          ) : null}
        </div>
      </main>
    </MotionConfig>
  );
}

type SpotProps = {
  award: FinalAward;
  name: string | undefined;
  holding: boolean;
  bursting: boolean;
};

function Spot({ award, name, holding, bursting }: SpotProps) {
  const style = AWARDS[award];
  const Icon = style.icon;
  const shown = name !== undefined;
  return (
    <div className="flex w-[min(18vw,16rem)] flex-col items-center">
      <div
        data-final-slot={award}
        className="relative flex h-[clamp(7rem,21vh,14rem)] w-full flex-col items-center justify-end pb-[1.5vh] text-center"
      >
        <AnimatePresence mode="wait">
          {shown ? (
            <motion.div
              key="name"
              initial={{ opacity: 0, scale: 0.4, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 15 }}
              className="flex w-full flex-col items-center"
            >
              <Icon className={cn("mb-[1vh] size-[clamp(1.6rem,4.5vh,3rem)]", style.text)} />
              <p
                className={cn(
                  "w-full font-heading leading-[1.05] font-bold text-balance wrap-break-word",
                  style.text,
                  award === "gold" ? "text-[clamp(2rem,6.5vh,4.5rem)]" : "text-[clamp(1.5rem,4.8vh,3.3rem)]",
                )}
                style={{ textShadow: `0 0 28px ${style.glow}` }}
              >
                {name || "—"}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="hidden"
              exit={{ opacity: 0, scale: 1.4, transition: { duration: 0.15 } }}
              animate={holding ? { x: [0, -7, 7, -5, 5, 0], scale: [1, 1.1, 1] } : { x: 0, scale: 1 }}
              transition={holding ? { duration: 0.4, repeat: Infinity, repeatDelay: 0.05 } : { duration: 0.3 }}
              className={cn(
                "flex size-[clamp(4rem,11vh,7rem)] items-center justify-center rounded-2xl border-2 border-dashed font-heading text-[clamp(2rem,6vh,4rem)] transition-colors",
                holding ? "border-white/80 text-white" : "border-white/20 text-white/30",
              )}
            >
              ?
            </motion.div>
          )}
        </AnimatePresence>
        {bursting ? <Confetti colors={style.sparks} glow={style.glow} /> : null}
      </div>

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-t-xl bg-linear-to-b from-white/12 to-white/3 ring-1 ring-white/10 transition-shadow duration-1000",
          award === "popular" && "rounded-t-[2rem]",
        )}
        style={{ height: style.height, boxShadow: shown ? `0 0 60px -10px ${style.glow}` : undefined }}
      >
        <div
          className={cn(
            "absolute inset-0 bg-linear-to-b transition-opacity duration-1000",
            style.face,
            shown ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="absolute inset-x-0 top-0 h-2 bg-white/30" />
        <div className="relative flex h-full flex-col items-center justify-start pt-[1.5vh]">
          {style.place ? (
            <span
              className={cn(
                "font-heading text-[clamp(2.5rem,9vh,6.5rem)] leading-none font-bold transition-colors duration-1000",
                shown ? "text-black/30" : "text-white/15",
              )}
            >
              {style.place}
            </span>
          ) : (
            <Heart
              className={cn(
                "mt-[1vh] size-[clamp(2rem,7vh,5rem)] transition-colors duration-1000",
                shown ? "fill-black/25 text-black/30" : "fill-white/10 text-white/15",
              )}
            />
          )}
          <span
            className={cn(
              "mt-[0.5vh] text-[clamp(0.7rem,1.6vh,1rem)] font-semibold tracking-[0.35em] uppercase transition-colors duration-1000",
              shown ? "text-black/45" : "text-white/40",
            )}
          >
            {style.label}
          </span>
        </div>
      </div>
    </div>
  );
}

const CONFETTI = Array.from({ length: 36 }, (_, index) => {
  const angle = (index / 36) * Math.PI * 2 + (index % 2) * 0.09;
  const distance = 90 + ((index * 37) % 5) * 30;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.8 - 30,
    rotate: (index * 47) % 360,
    size: 6 + (index % 3) * 3,
    round: index % 3 === 0,
  };
});

function Confetti({ colors, glow }: { colors: string[]; glow: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-10">
      <motion.div
        className="absolute size-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${glow}, transparent 70%)` }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 2.2, 2.6], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4 }}
      />
      {CONFETTI.map((piece, index) => (
        <motion.span
          key={index}
          className={cn("absolute block", piece.round ? "rounded-full" : "rounded-[2px]")}
          style={{
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 1.8,
            backgroundColor: colors[index % colors.length],
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: [0, piece.x, piece.x * 1.15],
            y: [0, piece.y, piece.y + 160],
            opacity: [1, 1, 0],
            rotate: [0, piece.rotate, piece.rotate * 2],
          }}
          transition={{ duration: 1.7, times: [0, 0.35, 1], ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
