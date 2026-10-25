import type { Metadata } from "next";
import { RandomOrderScreen } from "@/components/random-order-screen";

export const metadata: Metadata = {
  title: "Singing Order (Finals)",
};

export default function RandomOrderPage() {
  return <RandomOrderScreen />;
}
