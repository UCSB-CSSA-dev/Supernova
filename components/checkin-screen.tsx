"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { Backdrop } from "@/components/backdrop";
import { fetchCheckinCode } from "@/lib/backend";
import { describeWindow, formatWhen } from "@/lib/format";
import { useAppUrl } from "@/lib/urls";
import type { CheckinCode } from "@/lib/types";

const RETRY_MS = 3000;

export function CheckinScreen() {
  const checkinUrl = useAppUrl("/check-in");
  const [current, setCurrent] = useState<(CheckinCode & { receivedAt: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function sync() {
      let delay = RETRY_MS;
      try {
        const body = await fetchCheckinCode();
        if (!active) return;
        setCurrent({ ...body, receivedAt: Date.now() });
        setError(null);
        // Ask just after the slot turns over so the new code shows up promptly.
        delay = body.code ? body.refreshInMs + 400 : 5000;
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load the check-in code.");
      }
      timer = window.setTimeout(() => void sync(), delay);
    }
    void sync();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const qrValue = current?.code && checkinUrl ? `${checkinUrl}?k=${encodeURIComponent(current.code)}` : "";

  return (
    <main className="relative isolate flex h-dvh flex-col items-center justify-center overflow-hidden px-[4vw] py-[4vh]">
      <Backdrop />
      <Link href="/dashboard" className="absolute top-4 left-4 text-xs text-muted-foreground/60 hover:text-foreground">
        ← Dashboard
      </Link>

      <p className="text-sm tracking-[0.4em] text-primary uppercase">Supernova</p>
      <h1 className="sn-title font-heading text-[clamp(2.5rem,7vh,5.5rem)] leading-none font-bold">Check in</h1>

      {current && current.window.phase === "open" && qrValue ? (
        <div className="mt-[3vh] flex flex-col items-center">
          <motion.div
            key={current.code}
            initial={{ opacity: 0.4, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            className="rounded-3xl bg-white p-[2.2vh] shadow-[0_0_80px_oklch(0.84_0.14_85/0.35)]"
          >
            <QRCodeSVG value={qrValue} size={512} level="M" style={{ width: "min(56vh, 70vw)", height: "min(56vh, 70vw)" }} />
          </motion.div>
          <Countdown key={current.receivedAt} durationMs={current.refreshInMs} slotMs={current.slotMs} />
          {process.env.NODE_ENV === "development" ? (
            <a href={qrValue} target="_blank" rel="noreferrer" className="mt-2 text-xs text-muted-foreground underline">
              Open check-in link (local testing only)
            </a>
          ) : null}
          <p className="mt-[2vh] text-center text-[clamp(1rem,2.6vh,1.6rem)]">
            Scan with your phone camera and sign in with your <span className="text-primary">@ucsb.edu</span> Google account.
          </p>
          <p className="mt-1 text-[clamp(0.85rem,2vh,1.2rem)] text-muted-foreground tabular-nums">
            {current.registeredCount} checked in
            {current.window.closesAt ? ` · open until ${formatWhen(current.window.closesAt)}` : ""}
          </p>
        </div>
      ) : null}

      {current && current.window.phase !== "open" ? (
        <div className="mt-[6vh] text-center">
          <p className="font-heading text-[clamp(1.5rem,4vh,3rem)]">{describeWindow(current.window, "Check-in")}</p>
          <p className="mt-2 text-muted-foreground tabular-nums">{current.registeredCount} checked in</p>
        </div>
      ) : null}

      {!current && !error ? <p className="mt-8 text-muted-foreground">Loading the check-in code…</p> : null}
      {error ? <p className="mt-6 text-destructive">{error}</p> : null}
    </main>
  );
}

function Countdown({ durationMs, slotMs }: { durationMs: number; slotMs: number }) {
  const start = Math.min(1, durationMs / slotMs);
  return (
    <div className="mt-[2vh] h-1.5 w-[min(56vh,70vw)] overflow-hidden rounded-full bg-white/10" aria-hidden>
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: `${start * 100}%` }}
        animate={{ width: "0%" }}
        transition={{ duration: durationMs / 1000, ease: "linear" }}
      />
    </div>
  );
}
