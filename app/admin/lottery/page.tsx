import type { Metadata } from "next";
import { AdminGate } from "@/components/auth-gate";
import { LotteryScreen } from "@/components/lottery-screen";

export const metadata: Metadata = {
  title: "Lucky draw",
};

export default function LotteryPage() {
  return (
    <AdminGate>
      <LotteryScreen />
    </AdminGate>
  );
}
