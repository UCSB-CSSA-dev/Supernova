"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignedInAs } from "@/components/google-sign-in";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { BackendError, checkAdmin } from "@/lib/backend";
import { getSession, useSession } from "@/lib/session";
import type { UserSession } from "@/lib/types";

export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

function GateMessage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <p className="text-muted-foreground">{children}</p>
    </main>
  );
}

// Hides a page from signed-out visitors and sends them to /login. This only shapes the UI;
// the Apps Script checks the session on every request.
export function AuthGate({ children }: { children: (session: UserSession) => ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Read storage directly: during hydration the hook still reports the signed-out server value.
    if (session || getSession()) return;
    router.replace(loginHref(`${pathname}${window.location.search}`));
  }, [session, pathname, router]);

  if (!session) return <GateMessage>Taking you to sign in…</GateMessage>;
  return <>{children(session)}</>;
}

type AdminCheck = { status: "checking" } | { status: "allowed" } | { status: "denied"; message: string } | { status: "error"; message: string };

function AdminCheckGate({ session, children }: { session: UserSession; children: ReactNode }) {
  const [check, setCheck] = useState<AdminCheck>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    checkAdmin()
      .then(() => {
        if (active) setCheck({ status: "allowed" });
      })
      .catch((caught: unknown) => {
        if (!active || (caught instanceof BackendError && caught.signedOut)) return;
        const message = caught instanceof Error ? caught.message : "Could not check admin access.";
        setCheck(caught instanceof BackendError && caught.unauthenticated ? { status: "denied", message } : { status: "error", message });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (check.status === "allowed") return <>{children}</>;
  if (check.status === "checking") return <GateMessage>Checking admin access…</GateMessage>;
  return (
    <PageShell title="Admins only">
      <SignedInAs session={session} />
      {check.status === "denied" ? (
        <p className="mt-8">
          {check.message} Ask any admin to add you on the admin page, or tap Switch to use another account.
        </p>
      ) : (
        <div className="mt-8 space-y-3">
          <p className="text-destructive">{check.message}</p>
          <Button
            variant="outline"
            onClick={() => {
              setCheck({ status: "checking" });
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}
      <Link href="/dashboard" className="mt-6 text-sm text-primary underline-offset-4 hover:underline">
        Back to the dashboard
      </Link>
    </PageShell>
  );
}

export function AdminGate({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      {(session) => (
        <AdminCheckGate key={session.token} session={session}>
          {children}
        </AdminCheckGate>
      )}
    </AuthGate>
  );
}
