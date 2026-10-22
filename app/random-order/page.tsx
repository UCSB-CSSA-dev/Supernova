import type { Metadata } from "next";
import { RandomOrderScreen } from "@/components/random-order-screen";

export const metadata: Metadata = {
  title: "Singing order",
};

export default function RandomOrderPage() {
  return <RandomOrderScreen />;
}
