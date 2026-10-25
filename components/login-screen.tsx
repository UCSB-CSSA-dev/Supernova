"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdPoster } from "@/components/ad-slot";
import { GoogleSignIn } from "@/components/google-sign-in";
import { PageShell } from "@/components/page-shell";
import { useSession } from "@/lib/session";

// Only same-site paths, so a crafted link can't bounce people to another website after sign-in.
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return "/dashboard";
  return value;
}

export function LoginScreen() {
  const next = safeNext(useSearchParams().get("next"));
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace(next);
  }, [session, next, router]);

  return (
    <PageShell title="Sign in">
      {session ? (
        <p className="mt-8 text-muted-foreground">Signed in as {session.email}. Taking you there…</p>
      ) : (
        <GoogleSignIn prompt="Sign in with your UCSB Google account to check in, vote, and enter the lucky draw." />
      )}
      <AdPoster ad="welcome" className="mt-10" />
    </PageShell>
  );
}
