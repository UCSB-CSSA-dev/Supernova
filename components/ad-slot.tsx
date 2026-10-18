import Image from "next/image";
import logo from "@/assets/logo-transparent.webp";
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
