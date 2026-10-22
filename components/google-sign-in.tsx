"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/backend";
import { ALLOWED_DOMAIN, forgetGoogleAccount, googleClientId, loadGoogleIdentity } from "@/lib/google";
import { clearSession } from "@/lib/session";
import type { UserSession } from "@/lib/types";

export function GoogleSignIn({ prompt }: { prompt: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = googleClientId();

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    loadGoogleIdentity()
      .then((google) => {
        if (!active || !container.current) return;
        google.initialize({
          client_id: clientId,
          hd: ALLOWED_DOMAIN,
          cancel_on_tap_outside: false,
          callback: ({ credential }) => {
            if (!credential) return;
            setBusy(true);
            setError(null);
            signIn(credential)
              .catch((caught: unknown) => {
                forgetGoogleAccount();
                setError(caught instanceof Error ? caught.message : "Sign-in failed. Try again.");
              })
              .finally(() => setBusy(false));
          },
        });
        google.renderButton(container.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "signin_with",
          logo_alignment: "left",
          width: Math.min(320, container.current.clientWidth || 320),
        });
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Google sign-in could not load.");
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  return (
    <section className="mt-8 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <p>{prompt}</p>
      <p className="mt-1 text-sm text-muted-foreground">Only @{ALLOWED_DOMAIN} Google accounts are accepted.</p>
      {clientId ? (
        <div
          ref={container}
          // Google's button iframe paints an opaque white box when its color-scheme differs from the page.
          style={{ colorScheme: "light" }}
          className={busy ? "pointer-events-none mt-5 min-h-11 opacity-50" : "mt-5 min-h-11"}
        />
      ) : (
        <p className="mt-4 text-sm text-destructive">Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to the OAuth web client ID.</p>
      )}
      {busy ? <p className="mt-3 text-sm text-muted-foreground">Checking your account…</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

export function SignedInAs({ session }: { session: UserSession }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-muted-foreground">
        Signed in as <span className="text-foreground">{session.email}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          forgetGoogleAccount();
          clearSession();
        }}
      >
        Switch
      </Button>
    </div>
  );
}
