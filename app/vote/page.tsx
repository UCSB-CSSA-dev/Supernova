import type { Metadata } from "next";
import { VoteGate } from "@/components/vote-gate";

export const metadata: Metadata = {
  title: "Vote",
};

export default function VotePage() {
  return <VoteGate />;
}
