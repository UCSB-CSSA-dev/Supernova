import type { Metadata } from "next";
import { AdminGate } from "@/components/auth-gate";
import { CheckinScreen } from "@/components/checkin-screen";

export const metadata: Metadata = {
  title: "Check-in screen",
};

export default function CheckinScreenPage() {
  return (
    <AdminGate>
      <CheckinScreen />
    </AdminGate>
  );
}
