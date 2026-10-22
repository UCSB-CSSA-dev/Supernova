"use client";

import { AuthGate } from "@/components/auth-gate";
import { VoteScreen } from "@/components/vote-screen";

export function VoteGate() {
  return <AuthGate>{(session) => <VoteScreen key={session.token} session={session} />}</AuthGate>;
}
