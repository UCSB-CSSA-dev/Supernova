"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "working" | "done" | "error";

// The compact bar above a full-width sponsor ad on the check-in and vote screens.
export function StatusHeader({ tone, label, children }: { tone: StatusTone; label: string; children?: ReactNode }) {
  return (
    <header
      className={cn(
        "rounded-xl bg-card px-4 py-3 ring-1",
        tone === "error" ? "ring-destructive/40" : "ring-foreground/10",
      )}
      aria-live="polite"
      aria-busy={tone === "working"}
    >
      <div className="flex items-center gap-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={tone}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="flex shrink-0"
          >
            {tone === "working" ? (
              <LoaderCircle className="size-6 animate-spin text-primary" />
            ) : tone === "done" ? (
              <CircleCheck className="size-6 text-primary" />
            ) : (
              <TriangleAlert className="size-6 text-destructive" />
            )}
          </motion.span>
        </AnimatePresence>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[11px] tracking-[0.3em] uppercase", tone === "error" ? "text-destructive" : "text-primary")}>
            Supernova · {label}
          </p>
          {children}
        </div>
      </div>
    </header>
  );
}

export function LoadingDots() {
  return [0, 1, 2].map((dot) => (
    <motion.span
      key={dot}
      aria-hidden
      animate={{ opacity: [0.2, 1, 0.2] }}
      transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.2 }}
    >
      .
    </motion.span>
  ));
}
