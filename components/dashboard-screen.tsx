"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { BarChart3, Gift, Mic, QrCode, ScanLine, Settings, Trophy, Vote } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { SignedInAs } from "@/components/google-sign-in";
import { PageShell } from "@/components/page-shell";
import { checkAdmin } from "@/lib/backend";
import type { UserSession } from "@/lib/types";

type Destination = { href: string; title: string; description: string; icon: ComponentType<{ className?: string }> };

const AUDIENCE: Destination[] = [
  { href: "/check-in", title: "Check in", description: "Check in while check-in is open.", icon: ScanLine },
  { href: "/vote", title: "Vote", description: "Vote for your favorite performance once voting opens.", icon: Vote },
  {
    href: "/random-order",
    title: "Singing Order (Finals)",
    description: "Finalists: get your random spot in the lineup.",
    icon: Mic,
  },
];

const ADMIN: Destination[] = [
  { href: "/admin", title: "Admin", description: "Check-in and voting times, admins, and sheet status.", icon: Settings },
  { href: "/admin/check-in", title: "Check-in screen", description: "Check-in QR and live count for the projector.", icon: QrCode },
  { href: "/admin/voting-qr", title: "Voting QR", description: "Full-screen QR that opens the ballot.", icon: Vote },
  { href: "/result", title: "Results", description: "Live ranking of the performances for the projector.", icon: BarChart3 },
  { href: "/admin/lottery", title: "Lucky draw", description: "Draw winners from everyone who checked in and the singers.", icon: Gift },
  { href: "/final-result", title: "Final result", description: "Podium reveal of the winners for the projector.", icon: Trophy },
];

export function DashboardScreen() {
  return <AuthGate>{(session) => <DashboardLinks key={session.token} session={session} />}</AuthGate>;
}

function DashboardLinks({ session }: { session: UserSession }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    checkAdmin()
      .then(() => {
        if (active) setIsAdmin(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageShell title="Dashboard" className="max-w-2xl">
      <SignedInAs session={session} />
      <LinkGrid items={AUDIENCE} />
      {isAdmin ? (
        <>
          <h2 className="mt-10 text-sm tracking-[0.3em] text-primary uppercase">Admin</h2>
          <LinkGrid items={ADMIN} />
        </>
      ) : null}
    </PageShell>
  );
}

function LinkGrid({ items }: { items: Destination[] }) {
  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map(({ href, title, description, icon: Icon }) => (
        <li key={href}>
          <Link
            href={href}
            className="flex h-full gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-primary/60"
          >
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-heading text-lg">{title}</span>
              <span className="block text-sm text-muted-foreground">{description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
