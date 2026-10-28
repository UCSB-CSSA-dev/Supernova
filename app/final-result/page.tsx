import type { Metadata } from "next";
import { AdminGate } from "@/components/auth-gate";
import { FinalResultScreen } from "@/components/final-result-screen";

export const metadata: Metadata = {
  title: "Final result",
};

export default function FinalResultPage() {
  return (
    <AdminGate>
      <FinalResultScreen />
    </AdminGate>
  );
}
