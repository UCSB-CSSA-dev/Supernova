"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Backdrop } from "@/components/backdrop";
import { fetchCheckinStatus } from "@/lib/backend";
import { describeWindow, formatWhen } from "@/lib/format";
import { useAppUrl } from "@/lib/urls";
import type { CheckinStatus } from "@/lib/types";

const REFRESH_MS = 10000;

export function CheckinScreen() {
  const checkinUrl = useAppUrl("/check-in");
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function sync() {
      try {
        const body = await fetchCheckinStatus();
        if (!active) return;
        setStatus(body);
        setError(null);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load check-in.");
      }
      timer = window.setTimeout(() => void sync(), REFRESH_MS);
    }
    void sync();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="relative isolate flex h-dvh flex-col items-center justify-center overflow-hidden px-[4vw] py-[4vh]">
      <Backdrop />
      <Link href="/dashboard" className="absolute top-4 left-4 text-xs text-muted-foreground/60 hover:text-foreground">
        ← Dashboard
      </Link>

      <p className="text-sm tracking-[0.4em] text-primary uppercase">Supernova</p>
      <h1 className="sn-title font-heading text-[clamp(2.5rem,7vh,5.5rem)] leading-none font-bold">Check in</h1>

      {status && status.window.phase === "open" && checkinUrl ? (
        <div className="mt-[3vh] flex flex-col items-center">
          <div className="rounded-3xl bg-white p-[2.2vh] shadow-[0_0_80px_oklch(0.84_0.14_85/0.35)]">
            <QRCodeSVG value={checkinUrl} size={512} level="M" style={{ width: "min(56vh, 70vw)", height: "min(56vh, 70vw)" }} />
          </div>
          <p className="mt-[2vh] text-center text-[clamp(1rem,2.6vh,1.6rem)]">
            Scan with your phone camera and sign in with your <span className="text-primary">@ucsb.edu</span> Google account.
          </p>
          <p className="mt-1 text-[clamp(0.85rem,2vh,1.2rem)] text-muted-foreground tabular-nums">
            {status.registeredCount} checked in
            {status.window.closesAt ? ` · open until ${formatWhen(status.window.closesAt)}` : ""}
          </p>
        </div>
      ) : null}

      {status && status.window.phase !== "open" ? (
        <div className="mt-[6vh] text-center">
          <p className="font-heading text-[clamp(1.5rem,4vh,3rem)]">{describeWindow(status.window, "Check-in")}</p>
          <p className="mt-2 text-muted-foreground tabular-nums">{status.registeredCount} checked in</p>
        </div>
      ) : null}

      {!status && !error ? <p className="mt-8 text-muted-foreground">Loading check-in…</p> : null}
      {error ? <p className="mt-6 text-destructive">{error}</p> : null}
    </main>
  );
}
