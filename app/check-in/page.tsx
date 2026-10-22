import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckinPage } from "@/components/register-screen";

export const metadata: Metadata = {
  title: "Check in",
};

export default function CheckInPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <CheckinPage />
    </Suspense>
  );
}
