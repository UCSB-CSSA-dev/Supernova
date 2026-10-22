import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8", className)}>
      <p className="text-sm tracking-[0.35em] text-primary uppercase">Supernova</p>
      <h1 className="mt-2 font-heading text-4xl">{title}</h1>
      {children}
    </main>
  );
}
