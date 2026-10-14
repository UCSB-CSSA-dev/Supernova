import type { Metadata } from "next";
import { Suspense } from "react";
import { VoteGate } from "@/components/vote-gate";

export const metadata: Metadata = {
  title: "Vote",
};

export default function VotePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
          <p className="text-muted-foreground">Loading the ballot…</p>
        </main>
      }
    >
      <VoteGate />
    </Suspense>
  );
}
