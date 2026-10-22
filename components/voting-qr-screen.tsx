"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Backdrop } from "@/components/backdrop";
import { useAppUrl } from "@/lib/urls";

export function VotingQrScreen() {
  const voteUrl = useAppUrl("/vote");
  return (
    <main className="relative isolate flex h-dvh flex-col items-center justify-center overflow-hidden px-[4vw] py-[4vh]">
      <Backdrop />
      <Link href="/dashboard" className="absolute top-4 left-4 text-xs text-muted-foreground/60 hover:text-foreground">
        ← Dashboard
      </Link>
      <p className="text-sm tracking-[0.4em] text-primary uppercase">Supernova</p>
      <h1 className="sn-title font-heading text-[clamp(2.5rem,7vh,5.5rem)] leading-none font-bold">Vote now</h1>
      {voteUrl ? (
        <>
          <div className="mt-[3vh] rounded-3xl bg-white p-[2.2vh] shadow-[0_0_80px_oklch(0.84_0.14_85/0.35)]">
            <QRCodeSVG value={voteUrl} size={512} level="M" style={{ width: "min(56vh, 70vw)", height: "min(56vh, 70vw)" }} />
          </div>
          <p className="mt-[2.5vh] font-mono text-[clamp(1rem,2.8vh,1.8rem)] break-all">{voteUrl.replace(/^https?:\/\//, "")}</p>
          <p className="mt-1 text-center text-[clamp(0.9rem,2.2vh,1.3rem)] text-muted-foreground">
            Checked-in audience only · sign in with your @ucsb.edu Google account · one vote each
          </p>
        </>
      ) : null}
    </main>
  );
}
