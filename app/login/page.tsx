import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/login-screen";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <LoginScreen />
    </Suspense>
  );
}
