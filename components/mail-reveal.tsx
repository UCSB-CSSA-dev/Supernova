"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Dices, Heart, LoaderCircle, MailOpen, Trophy } from "lucide-react";
import { SpotlightStage } from "@/components/spotlight-stage";
import { Button } from "@/components/ui/button";
import { createSfx, type Sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

const SEEN_KEY = "supernova-mail-seen";
// The envelope lands in the slot at 2.9s; the flag goes up right after.
const ARRIVE_MS = 3100;
const OPENING_MS = 2100;
const CONFETTI_MS = 4000;

type Stage = "arrive" | "mailbox" | "opening" | "letter" | "shuffle" | "result";

function readSeen(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// Per account, since two people can share a phone and get different letters.
export function hasSeenMail(email: string): boolean {
  return readSeen().includes(email);
}

function markMailSeen(email: string): void {
  try {
    const seen = readSeen();
    if (!seen.includes(email)) window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, email]));
  } catch {
    // Without storage the letter simply plays again on the next visit.
  }
}

type MailRevealProps = {
  name: string;
  email: string;
  autoplay: boolean;
  // null while the singer list is still loading.
  qualified: boolean | null;
  error: string | null;
  claimed: boolean;
  onEnd: () => void;
  onRoll: () => void;
};

export function MailReveal({ name, email, autoplay, qualified, error, claimed, onEnd, onRoll }: MailRevealProps) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>(autoplay ? "arrive" : "result");
  const [sfx, setSfx] = useState<Sfx | null>(null);

  useEffect(() => () => sfx?.close(), [sfx]);

  useEffect(() => {
    const next = stage === "arrive" ? "mailbox" : stage === "opening" ? "letter" : null;
    if (!next) return;
    const timer = window.setTimeout(() => setStage(next), reduce ? 300 : stage === "arrive" ? ARRIVE_MS : OPENING_MS);
    return () => window.clearTimeout(timer);
  }, [stage, reduce]);

  function showStage() {
    if (!sfx) setSfx(createSfx());
    setStage("shuffle");
  }

  function showResult() {
    markMailSeen(email);
    setStage("result");
    onEnd();
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col overflow-hidden px-4 py-8">
      {stage === "result" && qualified && autoplay ? <Confetti /> : null}
      <p className="text-sm tracking-[0.35em] text-primary uppercase">Supernova</p>
      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <AnimatePresence mode="wait">
          {stage === "arrive" || stage === "mailbox" ? (
            <MailboxScene key="mailbox" delivered={stage === "mailbox"} onOpen={() => setStage("opening")} />
          ) : stage === "opening" ? (
            <OpeningEnvelope key="opening" />
          ) : stage === "shuffle" ? (
            <SpotlightStage
              key="stage"
              ready={qualified !== null || error !== null}
              qualified={qualified === true}
              failed={error !== null}
              sfx={sfx}
              onDone={showResult}
            />
          ) : (
            <motion.article
              key="letter"
              initial={{ y: 60, scale: 0.85, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 170, damping: 20 }}
              className="relative w-full rounded-2xl bg-[#fbf4e6] p-6 font-serif text-stone-800 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] ring-1 ring-amber-900/10 sm:p-8"
            >
              <header className="font-sans text-xs tracking-[0.3em] text-amber-800/70 uppercase">Supernova · 来信</header>
              <div className="mt-5">
                {stage === "letter" ? (
                  <ThanksPage name={name} onNext={showStage} />
                ) : (
                  <ResultPage email={email} qualified={qualified} error={error} claimed={claimed} celebrate={autoplay} onRoll={onRoll} />
                )}
              </div>
            </motion.article>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

const paperButton = "h-12 w-full bg-stone-900 font-sans text-base text-amber-50 hover:bg-stone-800";

// Starts above and left of the mailbox, swoops down, hovers over the slot, then slides in.
const ENVELOPE_FLIGHT = {
  x: [-260, -110, 0, 0, 0],
  y: [-300, -190, -50, -50, 70],
  rotate: [-30, -12, 0, 0, 0],
  scale: [1, 0.9, 0.6, 0.6, 0.6],
};
const ENVELOPE_START = { x: -260, y: -300, rotate: -30, scale: 1 };

function MailboxScene({ delivered, onOpen }: { delivered: boolean; onOpen: () => void }) {
  return (
    <motion.div exit={{ opacity: 0, scale: 0.9, y: 30 }} transition={{ duration: 0.35 }} className="flex flex-col items-center">
      <div className="relative h-[380px] w-[240px]">
        <motion.div
          aria-hidden
          className="absolute bottom-6 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.84_0.14_85/0.35),transparent_65%)]"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={delivered ? { opacity: [0, 1, 0.6], scale: [0.6, 1.15, 1] } : { opacity: 0, scale: 0.6 }}
          transition={{ duration: 1.2 }}
        />
        {/* Everything below the slot is clipped, so the envelope looks like it drops into the mailbox. */}
        <div className="pointer-events-none absolute -top-[400px] bottom-[150px] -left-[300px] -right-[300px] overflow-hidden">
          <motion.div
            className="absolute bottom-0 w-[120px]"
            style={{ left: 300 + 110 - 60, originY: 1 }}
            initial={ENVELOPE_START}
            animate={ENVELOPE_FLIGHT}
            transition={{ duration: 2.4, delay: 0.5, times: [0, 0.4, 0.72, 0.82, 1], ease: ["easeOut", "easeInOut", "linear", "easeIn"] }}
          >
            <Envelope />
          </motion.div>
        </div>
        <motion.div
          className="absolute bottom-0 left-0"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 16 }}
        >
          <motion.div
            style={{ originY: 1 }}
            animate={delivered ? { y: [0, -10, 0, -3, 0], rotate: [0, -3, 2, -1, 0] } : { y: 0, rotate: 0 }}
            transition={{ duration: 0.7 }}
          >
            <Mailbox flagUp={delivered} />
          </motion.div>
        </motion.div>
      </div>
      <div className="mt-4 min-h-36 text-center">
        <AnimatePresence mode="wait">
          {delivered ? (
            <motion.div key="delivered" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              <p className="font-heading text-2xl">叮咚！你有一封新来信</p>
              <p className="mt-1 text-sm text-muted-foreground">来自 Supernova 组委会</p>
              <Button className="mt-5 h-12 px-8 text-base" onClick={onOpen}>
                <MailOpen className="size-5" />
                打开信箱
              </Button>
            </motion.div>
          ) : (
            <motion.p key="delivering" exit={{ opacity: 0 }} className="text-sm tracking-[0.3em] text-muted-foreground">
              信件派送中…
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Mailbox({ flagUp }: { flagUp: boolean }) {
  return (
    <svg viewBox="0 0 240 220" width="240" height="220" aria-hidden className="overflow-visible">
      <rect x="101" y="152" width="18" height="68" rx="3" fill="#4a3a52" />
      <path d="M40 150 V75 A70 52 0 0 1 180 75 V150 Z" fill="#c8443d" />
      <path d="M40 150 V75 A70 52 0 0 1 72 31 A70 60 0 0 0 58 75 V150 Z" fill="#e0625a" opacity="0.6" />
      <rect x="71" y="62" width="78" height="16" rx="8" fill="#f2c45a" />
      <rect x="75" y="66" width="70" height="8" rx="4" fill="#1d1426" />
      <rect x="58" y="92" width="104" height="46" rx="8" fill="#a8352f" />
      <text x="110" y="121" textAnchor="middle" fontSize="13" fontWeight="700" letterSpacing="3" fill="#f6d9a0">
        MAIL
      </text>
      <circle cx="150" cy="115" r="4" fill="#f2c45a" />
      <rect x="34" y="146" width="152" height="10" rx="3" fill="#7d2a25" />
      <motion.g
        style={{ originX: 0.083, originY: 1 }}
        initial={{ rotate: 90 }}
        animate={{ rotate: flagUp ? 0 : 90 }}
        transition={{ type: "spring", stiffness: 260, damping: 11, delay: flagUp ? 0.15 : 0 }}
      >
        <rect x="181" y="72" width="6" height="56" rx="2" fill="#ddd6c6" />
        <rect x="187" y="72" width="30" height="18" rx="2" fill="#f2c45a" />
      </motion.g>
    </svg>
  );
}

function Envelope() {
  return (
    <svg viewBox="0 0 120 78" className="block w-full drop-shadow-lg" aria-hidden>
      <rect x="1" y="1" width="118" height="76" rx="5" fill="#fbf3e4" stroke="#e2cfae" strokeWidth="1.5" />
      <path d="M2 76 L60 40 L118 76" fill="none" stroke="#e2cfae" strokeWidth="1.5" />
      <path d="M1 3 L60 46 L119 3 Z" fill="#f3e2c3" stroke="#e2cfae" strokeWidth="1.5" strokeLinejoin="round" />
      <Seal />
    </svg>
  );
}

function Seal() {
  return (
    <>
      <circle cx="60" cy="43" r="8" fill="#c8443d" />
      <path d="M60 38.5l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#f6d9a0" />
    </>
  );
}

function OpeningEnvelope() {
  const [flapBehind, setFlapBehind] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setFlapBehind(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ y: 160, scale: 0.4, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ y: 60, opacity: 0, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 170, damping: 18 }}
      className="relative mt-28 w-[280px]"
      style={{ aspectRatio: "120 / 78", perspective: 800 }}
    >
      <svg viewBox="0 0 120 78" className="absolute inset-0 size-full drop-shadow-2xl" aria-hidden>
        <rect x="1" y="1" width="118" height="76" rx="5" fill="#e9d6b3" />
      </svg>
      <motion.div
        className="absolute inset-x-[8%] top-[6%] z-10 h-[88%] space-y-2 rounded-md bg-[#fbf4e6] p-4 shadow-md"
        initial={{ y: 0 }}
        animate={{ y: "-72%" }}
        transition={{ delay: 1, duration: 0.7, ease: "easeOut" }}
      >
        <div className="h-2 w-1/3 rounded bg-amber-800/30" />
        <div className="h-1.5 w-5/6 rounded bg-stone-300" />
        <div className="h-1.5 w-4/6 rounded bg-stone-300" />
        <div className="h-1.5 w-3/4 rounded bg-stone-300" />
      </motion.div>
      <svg viewBox="0 0 120 78" className="absolute inset-0 z-20 size-full" aria-hidden>
        <path d="M1 5 L60 46 L119 5 V72 Q119 77 114 77 H6 Q1 77 1 72 Z" fill="#fbf3e4" stroke="#e2cfae" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M2 76 L46 49 M118 76 L74 49" fill="none" stroke="#e2cfae" strokeWidth="1.5" />
      </svg>
      <motion.svg
        viewBox="0 0 120 52"
        className={cn("absolute inset-x-0 top-0 w-full", flapBehind ? "z-0" : "z-30")}
        style={{ originY: 0 }}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: 180 }}
        transition={{ delay: 0.45, duration: 0.5, ease: "easeInOut" }}
        aria-hidden
      >
        <path d="M1 3 L60 46 L119 3 Z" fill="#f3e2c3" stroke="#e2cfae" strokeWidth="1.5" strokeLinejoin="round" />
        <Seal />
      </motion.svg>
    </motion.div>
  );
}

const THANKS = [
  "感谢你在 Supernova 舞台上的精彩演出！",
  "你的歌声真挚动人，台风自信从容，每一个音符都打动了现场的观众。",
  "站上舞台，本身就是一种闪耀。谢谢你把这份热爱带给我们。",
];

function ThanksPage({ name, onNext }: { name: string; onNext: () => void }) {
  return (
    <div>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-lg font-semibold">
        亲爱的 {name || "歌手"}：
      </motion.p>
      {THANKS.map((line, index) => (
        <motion.p
          key={line}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 + index * 0.4 }}
          className="mt-3 leading-relaxed"
        >
          {line}
        </motion.p>
      ))}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 + THANKS.length * 0.4 }}
        className="mt-5 text-right text-sm text-stone-600"
      >
        —— UCSB CSSA Supernova 组委会
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + THANKS.length * 0.4 }}>
        <Button className={cn(paperButton, "mt-6")} onClick={onNext}>
          下一页
          <ArrowRight className="size-5" />
        </Button>
      </motion.div>
    </div>
  );
}

type ResultPageProps = {
  email: string;
  qualified: boolean | null;
  error: string | null;
  claimed: boolean;
  celebrate: boolean;
  onRoll: () => void;
};

function ResultPage({ email, qualified, error, claimed, celebrate, onRoll }: ResultPageProps) {
  if (qualified === null) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-stone-600">
        {error ? <p className="text-red-700">{error}</p> : <LoaderCircle className="size-6 animate-spin" />}
        {error ? null : <p>正在查询结果…</p>}
      </div>
    );
  }

  if (!qualified) {
    return (
      <div className="text-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
          className="mx-auto flex size-20 items-center justify-center rounded-full bg-rose-100 ring-2 ring-rose-300"
        >
          <Heart className="size-9 text-rose-500" />
        </motion.div>
        <h2 className="mt-5 text-3xl font-bold text-stone-700">很遗憾，未能晋级</h2>
        <p className="mt-3 leading-relaxed">
          这一次你没有进入决赛名单，
          <br />
          但你在台上的光芒，我们都看见了。
          <br />
          期待在下一个舞台再次遇见你！
        </p>
        <p className="mt-5 rounded-lg bg-stone-200/70 px-3 py-2 font-sans text-sm text-stone-600">
          决赛名单中没有 <span className="break-all">{email}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 0, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 11, delay: 0.15 }}
        className="mx-auto flex size-20 items-center justify-center rounded-full bg-amber-300/40 ring-2 ring-amber-500/70"
      >
        <Trophy className="size-10 text-amber-600" />
      </motion.div>
      <motion.h2
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 12, delay: 0.35 }}
        className="mt-5 text-4xl font-bold text-amber-700"
      >
        恭喜晋级！
      </motion.h2>
      <p className="mt-3 leading-relaxed">你已成功晋级 Supernova 决赛，我们决赛舞台见！</p>
      <p className="mt-5 rounded-lg bg-amber-100 px-3 py-2 font-sans text-sm text-amber-900 ring-1 ring-amber-900/10">
        决赛名单已收录 <span className="font-medium break-all">{email}</span>
      </p>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: celebrate ? 1.4 : 0.2 }}>
        <Button className={cn(paperButton, "mt-6")} onClick={onRoll}>
          <Dices className="size-5" />
          {claimed ? "查看我的出场顺序" : "抽取决赛出场顺序"}
        </Button>
      </motion.div>
    </div>
  );
}

const CONFETTI_COLORS = ["#f6c453", "#f08a5d", "#e85d75", "#9d7bea", "#4fc1b6", "#ffffff"];

type Piece = { x: number; y: number; vx: number; vy: number; size: number; spin: number; angle: number; color: string };

// Two bursts from the bottom corners, drawn over the whole page.
function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || reduce) return;
    const ctx = context;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);

    const pieces: Piece[] = Array.from({ length: 180 }, (_, index) => {
      const left = index % 2 === 0;
      const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      const speed = height * (0.9 + Math.random() * 0.8);
      return {
        x: left ? 0 : width,
        y: height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 6,
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * Math.PI,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      };
    });
    const start = performance.now();
    let last = start;
    let frame = 0;

    function step(now: number) {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.min(1, Math.max(0, (CONFETTI_MS - elapsed) / 1000));
      for (const piece of pieces) {
        piece.vy += height * 1.1 * dt;
        piece.vx *= 1 - 1.6 * dt;
        piece.vy *= 1 - 1.6 * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.angle += piece.spin * dt;
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.angle);
        ctx.scale(1, Math.cos(piece.angle * 1.7));
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        ctx.restore();
      }
      if (elapsed < CONFETTI_MS) frame = window.requestAnimationFrame(step);
      else ctx.clearRect(0, 0, width, height);
    }

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [reduce]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50 size-full" aria-hidden />;
}
