"use client";

import { useSearchParams } from "next/navigation";
import { VoteScreen } from "@/components/vote-screen";

export function VoteGate() {
  const code = useSearchParams().get("code")?.trim() ?? "";
  if (!code) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
        <p className="text-sm tracking-[0.35em] text-primary uppercase">Supernova</p>
        <h1 className="mt-2 font-heading text-4xl">Cast your vote</h1>
        <p className="mt-8 text-muted-foreground">This page needs the personal link from your email.</p>
      </main>
    );
  }
  return <VoteScreen code={code} />;
}
