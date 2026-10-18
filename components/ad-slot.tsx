import Image from "next/image";
import logo from "@/assets/logo-transparent.webp";
import poster from "@/assets/poster-sample.jpg";
import { cn } from "@/lib/utils";

// Placeholder until a sponsor ad replaces it.
export function AdSlot({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Sponsor"
      className={cn("overflow-hidden rounded-xl bg-white px-4 pt-2 pb-3 text-neutral-900 shadow-lg", className)}
    >
      <p className="text-[10px] font-medium tracking-[0.25em] text-neutral-400 uppercase">Sponsor</p>
      <Image src={logo} alt="UCSB CSSA logo" className="mx-auto mt-1 h-auto w-full max-w-72" />
      <p className="mt-1 text-center text-sm font-semibold tracking-wide">UCSB CSSA</p>
    </aside>
  );
}

// Full-width placeholder under the vote confirmation until a sponsor poster replaces it.
export function AdPoster({ className }: { className?: string }) {
  return (
    <aside aria-label="Sponsor" className={cn("flex flex-col", className)}>
      <p className="mb-2 text-[10px] font-medium tracking-[0.25em] text-muted-foreground uppercase">Sponsor</p>
      <Image
        src={poster}
        alt="2026 UCSB CSSA Supernova poster"
        sizes="(max-width: 512px) 100vw, 512px"
        className="h-auto w-full rounded-xl ring-1 ring-foreground/10"
        priority
      />
    </aside>
  );
}
