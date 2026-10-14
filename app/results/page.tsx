import type { Metadata } from "next";
import { ResultsBoard } from "@/components/results-board";

export const metadata: Metadata = {
  title: "Results",
};

export default function ResultsPage() {
  return <ResultsBoard />;
}
