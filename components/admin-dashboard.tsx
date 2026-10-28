"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ADS, type AdId } from "@/components/ad-slot";
import { WindowControl } from "@/components/window-control";
import { AdminList } from "@/components/admin-list";
import { FinalResultAdmin } from "@/components/final-result-admin";
import { OrderAdmin } from "@/components/order-admin";
import { ResetButton } from "@/components/reset-button";
import { fetchAdminStatus, resetCheckin, resetLottery, resetVotes, signOut } from "@/lib/backend";
import { formatWhen } from "@/lib/format";
import { googleClientId } from "@/lib/google";
import { useAppUrl } from "@/lib/urls";
import type { AdminStatus, TimeWindow, WindowName } from "@/lib/types";

export function AdminDashboard() {
  const voteUrl = useAppUrl("/vote");
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      setStatus(await fetchAdminStatus());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the admin page.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // Load the sheet status once when the dashboard opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch(() => setLoadError("Could not load the admin page."));
  }, []);

  function updateWindow(name: WindowName, next: TimeWindow) {
    setStatus((current) => (current ? { ...current, [name]: next } : current));
  }

  async function copyVoteUrl() {
    try {
      await navigator.clipboard.writeText(voteUrl);
      toast.success("Voting link copied.");
    } catch {
      toast.error("Could not copy. Select the link and copy it instead.");
    }
  }

  const setupBlocked = Boolean(status && status.problems.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm tracking-[0.3em] text-primary uppercase">Supernova</p>
          <h1 className="font-heading text-4xl">Admin</h1>
          {status ? <p className="mt-1 text-sm text-muted-foreground">Signed in as {status.viewer}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>
            Dashboard
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/result" />}>
            Results
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      {loadError ? <p className="text-destructive">{loadError}</p> : null}
      {!status && !loadError ? <p className="text-muted-foreground">Loading spreadsheets…</p> : null}

      {status ? (
        <>
          {status.problems.length > 0 || !googleClientId() ? (
            <Card>
              <CardHeader>
                <CardTitle>Finish setup</CardTitle>
                <CardDescription>
                  Add the missing script properties in the Apps Script project, then redeploy the web app.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {status.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                  {!googleClientId() ? <li>NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set for this site build.</li> : null}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Spreadsheets</CardTitle>
              <CardDescription>
                Opened by {status.accountEmail || "the Google account that deployed the script"}. That account needs
                edit access to Registrations, Results, and Variables. Lottery draws are saved to a Lottery tab in
                Registrations. Variables holds the check-in and voting times and the trusted admin list.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {status.sheets ? (
                Object.values(status.sheets).map((sheet) => (
                  <div key={sheet.label} className="flex items-start justify-between gap-3">
                    <div>
                      <a className="font-medium underline-offset-4 hover:underline" href={sheet.url} target="_blank" rel="noreferrer">
                        {sheet.label}
                      </a>
                      <p className="text-sm text-muted-foreground">{sheet.error ?? `${sheet.rows ?? 0} rows`}</p>
                    </div>
                    <Badge variant={sheet.error ? "destructive" : "secondary"}>{sheet.error ? "Check share" : "Connected"}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Set the spreadsheet script properties to open the sheet links.</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm text-muted-foreground">
                <span>{status.registeredCount} checked in</span>
                <span>{status.singerCount} performers</span>
                <span>{status.voteCount} votes</span>
                <span>{status.drawCount} lottery winners</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>1. Check-in</CardTitle>
              <CardDescription>
                While check-in is open, anyone who opens the check-in page with a @ucsb.edu Google account is checked
                in. Put the check-in screen on a projector so people can scan its QR code. People who open the page
                early are checked in automatically when it opens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <WindowControl
                key={`${status.checkin.opensAt}|${status.checkin.closesAt}`}
                name="checkin"
                label="Check-in"
                window={status.checkin}
                disabled={setupBlocked}
                onChange={(next) => updateWindow("checkin", next)}
              />
              <div className="flex flex-wrap gap-2">
                <Button nativeButton={false} render={<Link href="/admin/check-in" />}>
                  Open check-in screen
                </Button>
                <ResetButton
                  label="Reset check-in"
                  title="Reset check-in?"
                  description={
                    <>
                      All {status.registeredCount} check-ins are cleared, so everyone has to check in again before they can
                      vote or enter the lucky draw. Votes already cast and lucky draw winners are not affected. The current
                      list is kept in the Registrations spreadsheet as a dated tab.
                    </>
                  }
                  success="Check-in reset. Everyone needs to check in again."
                  disabled={setupBlocked || status.registeredCount === 0}
                  onReset={async () => {
                    await resetCheckin();
                    await refresh();
                  }}
                />
              </div>
              {status.recentRegistrations.length > 0 ? (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium">Latest check-ins</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {status.recentRegistrations.map((row) => (
                      <li key={row.email} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {row.name} <span className="text-muted-foreground">· {row.email}</span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">{formatWhen(row.registeredAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Voting</CardTitle>
              <CardDescription>
                Anyone can open the voting link, but only people who checked in can vote, once each, while voting is
                open. Schedule a time or use Open in 2 min rather than Open now: waiting phones then show a countdown
                and open the ballot by themselves, so hundreds of them don&apos;t all hit Google at the same second.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <WindowControl
                key={`${status.voting.opensAt}|${status.voting.closesAt}`}
                name="voting"
                label="Voting"
                leadMinutes={2}
                window={status.voting}
                disabled={setupBlocked}
                onChange={(next) => updateWindow("voting", next)}
              />
              {voteUrl ? (
                <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center">
                  <div className="shrink-0 self-start rounded-lg bg-white p-2">
                    <QRCodeSVG value={voteUrl} size={112} level="M" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="font-mono text-sm break-all">{voteUrl}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void copyVoteUrl()}>
                        Copy link
                      </Button>
                      <Button variant="outline" nativeButton={false} render={<Link href="/admin/voting-qr" />}>
                        Full-screen QR
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="border-t pt-4">
                <ResetButton
                  label="Reset votes"
                  title="Reset all votes?"
                  description={
                    <>
                      All {status.voteCount} votes are cleared, the results board goes back to zero, and everyone who
                      checked in can vote again. Check-ins and lucky draw winners are not affected. The current votes are
                      kept in the Results spreadsheet as a dated tab.
                    </>
                  }
                  success="Votes reset. Everyone who checked in can vote again."
                  disabled={setupBlocked || status.voteCount === 0}
                  onReset={async () => {
                    await resetVotes();
                    await refresh();
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Lucky draw</CardTitle>
              <CardDescription>
                Draws one person at a time from everyone who checked in plus the {status.finalistCount ?? 0} singers on
                the singer list (singers can&apos;t check in). Nobody can be drawn twice, and every draw is saved to the
                Lottery tab. Winners claim their prize right after the show. {status.drawCount} drawn so far,{" "}
                {Math.max(0, (status.lotteryEntrants ?? status.registeredCount) - status.drawCount)} left in the draw.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href="/admin/lottery" />} disabled={setupBlocked}>
                Open lottery screen
              </Button>
              <ResetButton
                label="Reset lucky draw"
                title="Reset the lucky draw?"
                description={
                  <>
                    All {status.drawCount} winners are cleared and everyone who checked in, plus the singers, is back in
                    the draw. The
                    current winners are kept in the Registrations spreadsheet as a renamed Lottery tab.
                  </>
                }
                success="Lucky draw reset. Everyone in the draw can be drawn again."
                disabled={setupBlocked || status.drawCount === 0}
                onReset={async () => {
                  await resetLottery();
                  await refresh();
                }}
              />
            </CardContent>
          </Card>

          <OrderAdmin disabled={setupBlocked} />

          <FinalResultAdmin disabled={setupBlocked} />

          <AdminList
            admins={status.admins}
            isOwner={status.isOwner}
            onChange={(admins) => setStatus((current) => (current ? { ...current, admins } : current))}
          />

          <Card>
            <CardHeader>
              <CardTitle>Sponsor ad views</CardTitle>
              <CardDescription>
                How many times each ad was shown, and how many different signed-in people saw it. Views are sent along
                with people&apos;s next request, so counts can trail by a minute. Saved to the Ad views tab of the
                Variables spreadsheet; press Refresh at the top for new numbers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">People</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Object.keys(ADS) as AdId[]).map((ad) => {
                    const count = (status.adViews ?? []).find((item) => item.ad === ad);
                    return (
                      <TableRow key={ad}>
                        <TableCell>
                          <span className="block">{ADS[ad].placement}</span>
                          <span className="block text-xs text-muted-foreground">{ADS[ad].alt}</span>
                        </TableCell>
                        <TableCell className="text-right font-heading tabular-nums">{count?.views ?? 0}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">{count?.viewers ?? 0}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </main>
  );
}
