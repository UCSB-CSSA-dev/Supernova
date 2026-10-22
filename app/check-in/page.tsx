import type { Metadata } from "next";
import { CheckinPage } from "@/components/register-screen";

export const metadata: Metadata = {
  title: "Check in",
};

export default function CheckInPage() {
  return <CheckinPage />;
}
