import type { Metadata } from "next";
import { AdminGate } from "@/components/auth-gate";
import { VotingQrScreen } from "@/components/voting-qr-screen";

export const metadata: Metadata = {
  title: "Voting QR",
};

export default function VotingQrPage() {
  return (
    <AdminGate>
      <VotingQrScreen />
    </AdminGate>
  );
}
