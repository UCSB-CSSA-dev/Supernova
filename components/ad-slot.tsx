"use client";

import { useEffect, useRef } from "react";
import Image, { type StaticImageData } from "next/image";
import checkinAd from "@/assets/ad-placeholder.jpg";
import welcomeAd from "@/assets/ad-placeholder-2.jpg";
import logo from "@/assets/logo-transparent.webp";
import poster from "@/assets/poster-sample.jpg";
import { recordAdView } from "@/lib/backend";
import { cn } from "@/lib/utils";

// Placeholders until sponsor ads replace them. The keys are the ad ids counted by AD_IDS in Code.gs.
// Images are cropped to fill their frame, so supply sponsor ads at the frame's shape to show them uncropped.
export const ADS = {
  welcome: { src: welcomeAd, alt: "SM横版", placement: "Sign-in page and check-in start", frame: "aspect-[4/3]" },
  checkin: { src: checkinAd, alt: "UCSB CSSA竖版", placement: "While checking in and after", frame: "aspect-[4/5]" },
  poster: { src: poster, alt: "SM竖版", placement: "While submitting a vote and after", frame: "aspect-[4/5]" },
  logo: { src: logo, alt: "UCSB CSSA logo", placement: "Vote confirmation dialog", frame: "" },
} satisfies Record<string, { src: StaticImageData; alt: string; placement: string; frame: string }>;

export type AdId = keyof typeof ADS;

// Counts one view each time the ad is shown.
function useAdView(ad: AdId) {
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    recordAdView(ad);
  }, [ad]);
}

export function AdSlot({ className }: { className?: string }) {
  useAdView("logo");
  return (
    <aside
      aria-label="Sponsor"
      className={cn("overflow-hidden rounded-xl bg-white px-4 pt-2 pb-3 text-neutral-900 shadow-lg", className)}
    >
      <p className="text-[10px] font-medium tracking-[0.25em] text-neutral-400 uppercase">Sponsor</p>
      <Image src={ADS.logo.src} alt={ADS.logo.alt} className="mx-auto mt-1 h-auto w-full max-w-72" />
      <p className="mt-1 text-center text-sm font-semibold tracking-wide">UCSB CSSA</p>
    </aside>
  );
}

export function AdPoster({ ad = "poster", className }: { ad?: Exclude<AdId, "logo">; className?: string }) {
  useAdView(ad);
  return (
    <aside aria-label="Sponsor" className={cn("flex flex-col", className)}>
      <p className="mb-2 text-[10px] font-medium tracking-[0.25em] text-muted-foreground uppercase">Sponsor</p>
      <Image
        src={ADS[ad].src}
        alt={ADS[ad].alt}
        sizes="(max-width: 512px) 100vw, 512px"
        // className={cn("h-auto w-full rounded-xl object-cover ring-1 ring-foreground/10", ADS[ad].frame)}
        className="h-auto w-full rounded-xl object-cover ring-1 ring-foreground/10"
        priority
      />
    </aside>
  );
}
