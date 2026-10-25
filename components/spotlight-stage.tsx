"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Volume2, VolumeX } from "lucide-react";
import type { Sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

const SUSPENSE_MS = 4800;
const LAND_MS = 1100;
const SPOTLIT_HOLD_MS = 1900;
const PASSED_HOLD_MS = 2800;
// Fractions of the stage width.
const BEAM_SOURCES = [0.15, 0.5, 0.85];
const MIC_SLOTS = [0.1, 0.3, 0.5, 0.7, 0.9];
const YOUR_MIC = 2;
// For a singer who didn't qualify, each beam lands on someone else and then switches off in turn.
const PASSED_TARGETS = [0, 3, 4];
const BEAM_OFF_SECONDS = [0.6, 1.1, 1.6];
const SWEEP_SPEEDS = [1, 1.35, 0.8];
const CAPTIONS: [number, string][] = [
  [0, "评委正在做最终决定…"],
  [1700, "聚光灯正在寻找晋级者…"],
  [3300, "结果即将揭晓…"],
];
const STAGE_HEIGHT = "min(60dvh, 440px)";

type Phase = "suspense" | "landing" | "spotlit" | "passed";

type SpotlightStageProps = {
  ready: boolean;
  qualified: boolean;
  failed: boolean;
  sfx: Sfx | null;
  onDone: () => void;
};

// Spotlights sweep faster and faster over the singers' mics, then either all land on yours or pass you by.
// Keeps sweeping until the result has loaded.
export function SpotlightStage({ ready, qualified, failed, sfx, onDone }: SpotlightStageProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("suspense");
  const [caption, setCaption] = useState(0);
  const [muted, setMuted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const beamRefs = useRef<(HTMLDivElement | null)[]>([]);
  const latest = useRef({ ready, qualified, failed, onDone });

  useEffect(() => {
    latest.current = { ready, qualified, failed, onDone };
  });

  useEffect(() => {
    const timers = CAPTIONS.slice(1).map(([at], index) => window.setTimeout(() => setCaption(index + 1), at));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    sfx?.setMuted(muted);
  }, [sfx, muted]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const width = stage.clientWidth;
    const micTop = stage.clientHeight - 110;
    const aim = (beam: number, mic: number) =>
      (-Math.atan2((MIC_SLOTS[mic] - BEAM_SOURCES[beam]) * width, micTop) * 180) / Math.PI;
    const angles = BEAM_SOURCES.map((_, beam) => aim(beam, YOUR_MIC));
    const timers: number[] = [];
    let frame = 0;
    let poll = 0;

    function draw() {
      beamRefs.current.forEach((beam, index) => {
        if (beam) beam.style.transform = `rotate(${angles[index]}deg)`;
      });
    }

    function finish(isQualified: boolean) {
      if (latest.current.failed) {
        latest.current.onDone();
        return;
      }
      setPhase(isQualified ? "spotlit" : "passed");
      if (isQualified) sfx?.crash();
      else if (sfx) {
        sfx.fall();
        BEAM_OFF_SECONDS.forEach((seconds) => sfx.off(sfx.now() + seconds));
      }
      timers.push(window.setTimeout(() => latest.current.onDone(), isQualified ? SPOTLIT_HOLD_MS : PASSED_HOLD_MS));
    }

    if (reduce) {
      draw();
      poll = window.setInterval(() => {
        if (!latest.current.ready) return;
        window.clearInterval(poll);
        BEAM_SOURCES.forEach((_, beam) => {
          angles[beam] = aim(beam, latest.current.qualified ? YOUR_MIC : PASSED_TARGETS[beam]);
        });
        draw();
        finish(latest.current.qualified);
      }, 200);
      return () => {
        window.clearInterval(poll);
        timers.forEach((timer) => window.clearTimeout(timer));
      };
    }

    const start = performance.now();
    let last = start;
    let sweep = 0;
    let nextBeat = start + 250;
    let rollAt = sfx ? sfx.now() : 0;
    let landing: { start: number; from: number[]; to: number[]; qualified: boolean } | null = null;

    function heartbeat(progress: number) {
      pulseRef.current?.animate([{ opacity: 0 }, { opacity: 0.25 + 0.5 * progress }, { opacity: 0 }], { duration: 420, easing: "ease-out" });
      const shake = 1 + 5 * progress;
      stage?.animate(
        [
          { transform: "none" },
          { transform: `translate(${shake}px, ${-shake / 2}px) scale(1.012)` },
          { transform: `translate(${-shake}px, ${shake / 2}px)` },
          { transform: "none" },
        ],
        { duration: 260 },
      );
      sfx?.thump();
    }

    function step(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const progress = Math.min(1, (now - start) / SUSPENSE_MS);

      if (!landing) {
        sweep += dt * (1.3 + 5 * progress * progress);
        BEAM_SOURCES.forEach((_, beam) => {
          angles[beam] = aim(beam, YOUR_MIC) * 0.4 + 40 * Math.sin(sweep * SWEEP_SPEEDS[beam] + beam * 2.1);
        });
        if (now >= nextBeat) {
          heartbeat(progress);
          nextBeat = now + 900 - 520 * progress;
        }
        if (progress >= 1 && latest.current.ready) {
          if (latest.current.failed) {
            finish(false);
            return;
          }
          const isQualified = latest.current.qualified;
          landing = {
            start: now,
            from: [...angles],
            to: BEAM_SOURCES.map((_, beam) => aim(beam, isQualified ? YOUR_MIC : PASSED_TARGETS[beam])),
            qualified: isQualified,
          };
          setPhase("landing");
        }
      } else {
        const done = Math.min(1, (now - landing.start) / LAND_MS);
        const eased = 1 - Math.pow(1 - done, 3);
        const { from, to } = landing;
        BEAM_SOURCES.forEach((_, beam) => {
          angles[beam] = from[beam] + (to[beam] - from[beam]) * eased;
        });
        if (done >= 1) {
          draw();
          finish(landing.qualified);
          return;
        }
      }

      if (sfx) {
        const intensity = landing ? 1 : progress;
        rollAt = Math.max(rollAt, sfx.now());
        while (rollAt < sfx.now() + 0.12) {
          sfx.snare(rollAt, 0.08 + 0.32 * intensity);
          rollAt += 0.11 - 0.065 * intensity;
        }
      }
      draw();
      frame = window.requestAnimationFrame(step);
    }

    frame = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [reduce, sfx]);

  const text =
    phase === "spotlit"
      ? "聚光灯属于你！"
      : phase === "passed"
        ? "聚光灯没有停在你身上…"
        : phase === "landing"
          ? "灯光即将落下…"
          : CAPTIONS[caption][1];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      className="w-full"
    >
      <div className="mb-4 flex h-10 items-center justify-center text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={text}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "text-2xl font-semibold",
              phase === "spotlit" ? "text-amber-300" : phase === "passed" ? "text-sky-200/80" : "text-foreground",
            )}
          >
            {text}
          </motion.p>
        </AnimatePresence>
      </div>

      <div
        ref={stageRef}
        className="relative w-full overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_115%,#2e2250_0%,#0d0a18_55%,#05040a_100%)] ring-1 ring-white/10"
        style={{ height: STAGE_HEIGHT }}
      >
        {BEAM_SOURCES.map((source, beam) => (
          <div key={beam} className="absolute -top-3 z-10" style={{ left: `${source * 100}%` }}>
            <div
              ref={(element) => {
                beamRefs.current[beam] = element;
              }}
              className={cn(
                "absolute top-0 left-0 w-[120px] -translate-x-1/2 origin-top transition-opacity duration-500",
                phase === "passed" && "opacity-0",
              )}
              style={{
                height: `calc(${STAGE_HEIGHT} * 1.5)`,
                transitionDelay: phase === "passed" ? `${BEAM_OFF_SECONDS[beam]}s` : "0s",
                clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
                background: "linear-gradient(to bottom, rgb(255 244 214 / 0.9), rgb(255 236 190 / 0.22) 70%, transparent)",
                mixBlendMode: "screen",
              }}
            />
            <div className="absolute -top-1 left-0 size-6 -translate-x-1/2 rounded-full bg-stone-700 shadow-[0_0_20px_6px_rgb(255_240_200/0.45)] ring-2 ring-stone-500" />
          </div>
        ))}

        <div className="absolute inset-x-0 bottom-0 h-[110px]">
          {MIC_SLOTS.map((slot, mic) => {
            const yours = mic === YOUR_MIC;
            const target = PASSED_TARGETS.indexOf(mic);
            const lit = (phase === "spotlit" && yours) || (phase === "passed" && target !== -1);
            const offAt = target === -1 ? 0 : BEAM_OFF_SECONDS[target];
            return (
              <div key={mic} className="absolute bottom-2 -translate-x-1/2" style={{ left: `${slot * 100}%` }}>
                <motion.div
                  className="absolute bottom-0 left-1/2 h-5 w-24 -translate-x-1/2 rounded-[50%] bg-amber-100/70 blur-md"
                  initial={{ opacity: 0 }}
                  animate={
                    phase === "passed" && lit
                      ? { opacity: [0, 1, 1, 0] }
                      : { opacity: lit ? 1 : 0 }
                  }
                  transition={
                    phase === "passed" && lit
                      ? { duration: offAt + 0.5, times: [0, 0.1, offAt / (offAt + 0.5), 1] }
                      : { duration: 0.4 }
                  }
                />
                {yours ? <Singer spotlit={phase === "spotlit"} dimmed={phase === "passed"} /> : null}
                {yours ? <YouMarker spotlit={phase === "spotlit"} dimmed={phase === "passed"} /> : null}
                <StageMic state={phase === "spotlit" && yours ? "gold" : phase === "passed" && lit ? "lit" : "dark"} />
              </div>
            );
          })}
        </div>

        <div
          ref={pulseRef}
          className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(circle_at_50%_55%,transparent_35%,rgb(220_38_38/0.5)_100%)] opacity-0"
        />

        {phase === "spotlit" ? <SpotlitBurst /> : null}
        {phase === "passed" ? (
          <motion.div
            className="pointer-events-none absolute inset-0 z-20 bg-[#081633]/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 1 }}
          />
        ) : null}

        {sfx ? (
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="absolute top-3 right-3 z-30 rounded-full bg-black/40 p-2 text-white/70 ring-1 ring-white/15 hover:text-white"
            aria-label={muted ? "打开声音" : "静音"}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}

// A soft, featureless figure standing behind the viewer's mic.
function Singer({ spotlit, dimmed }: { spotlit: boolean; dimmed: boolean }) {
  return (
    <svg
      viewBox="0 0 80 130"
      className={cn(
        "absolute bottom-0 left-1/2 h-[130px] w-20 -translate-x-1/2 blur-[1.5px] transition-[opacity,filter] duration-700",
        spotlit ? "opacity-100 drop-shadow-[0_0_14px_rgb(246_196_83/0.55)]" : dimmed ? "opacity-25" : "opacity-80",
      )}
      aria-hidden
    >
      <defs>
        <linearGradient id="singer-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={spotlit ? "#8a7550" : "#4a3d70"} />
          <stop offset="100%" stopColor={spotlit ? "#3d3250" : "#1c1630"} />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="22" rx="14" ry="17" fill="url(#singer-fill)" />
      <path d="M6 130 C6 82 17 52 40 50 C63 52 74 82 74 130 Z" fill="url(#singer-fill)" />
    </svg>
  );
}

// A bobbing arrow and a dashed floor ring mark the viewer's own mic without any text.
function YouMarker({ spotlit, dimmed }: { spotlit: boolean; dimmed: boolean }) {
  const color = spotlit ? "text-amber-300" : dimmed ? "text-white/25" : "text-white/80";
  return (
    <>
      <div
        className={cn(
          "absolute -bottom-1 left-1/2 h-6 w-16 -translate-x-1/2 rounded-[50%] border-2 border-dashed transition-colors duration-500",
          spotlit ? "border-amber-300" : dimmed ? "border-white/15" : "border-white/45",
        )}
      />
      <motion.svg
        viewBox="0 0 20 14"
        className={cn("absolute -top-14 left-1/2 h-4 w-5 -translate-x-1/2 transition-colors duration-500", color)}
        animate={dimmed ? { y: 0 } : { y: [0, 6, 0] }}
        transition={dimmed ? { duration: 0.4 } : { duration: spotlit ? 0.5 : 0.9, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      >
        <path d="M2 2 L10 12 L18 2 Z" fill="currentColor" />
      </motion.svg>
    </>
  );
}

function StageMic({ state }: { state: "dark" | "lit" | "gold" }) {
  const fill = state === "gold" ? "#f6c453" : state === "lit" ? "#efe6d2" : "#2b2342";
  return (
    <svg
      viewBox="0 0 40 96"
      className={cn(
        "relative block h-24 w-10 transition-[filter] duration-500",
        state === "gold" && "drop-shadow-[0_0_18px_rgb(246_196_83/0.9)]",
      )}
      aria-hidden
    >
      <rect x="13" y="2" width="14" height="24" rx="7" fill={fill} />
      <path d="M15 9h10M15 14h10M15 19h10" stroke="#000" strokeOpacity="0.25" strokeWidth="1.2" />
      <path d="M8 16a12 12 0 0 0 24 0" fill="none" stroke={fill} strokeWidth="2.5" />
      <rect x="18.75" y="28" width="2.5" height="58" fill={fill} />
      <path d="M6 94 L20 84 L34 94" stroke={fill} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const SPARKS = Array.from({ length: 16 }, (_, index) => {
  const angle = (index / 16) * Math.PI * 2;
  const distance = 70 + (index % 3) * 30;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, color: index % 2 ? "#f6c453" : "#fff4d6" };
});

function SpotlitBurst() {
  return (
    <>
      <motion.div
        className="pointer-events-none absolute inset-0 z-20 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.85, 0] }}
        transition={{ duration: 0.7 }}
      />
      <div className="pointer-events-none absolute bottom-[70px] left-1/2 z-20">
        {SPARKS.map((spark, index) => (
          <motion.span
            key={index}
            className="absolute size-2 rounded-full"
            style={{ backgroundColor: spark.color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: spark.x, y: spark.y, opacity: 0, scale: 0.4 }}
            transition={{ duration: 1.1, ease: "easeOut", delay: 0.05 }}
          />
        ))}
      </div>
    </>
  );
}
