"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fetchOrderAdmin, resetOrder, setSingers } from "@/lib/backend";
import { formatWhen } from "@/lib/format";
import type { OrderAdminState } from "@/lib/types";

export function OrderAdmin({ disabled }: { disabled?: boolean }) {
  const [order, setOrder] = useState<OrderAdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  // null until the admin starts editing, so a refresh shows the saved list.
  const [edited, setEdited] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draft = edited ?? order?.singers.join("\n") ?? "";

  async function load() {
    setLoading(true);
    try {
      setOrder(await fetchOrderAdmin());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the singing order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (disabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [disabled]);

  async function saveSingers() {
    const emails = draft
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    setSaving(true);
    try {
      const next = await setSingers(emails);
      setOrder(next);
      setEdited(null);
      toast.success(`Singer list saved: ${next.singers.length} ${next.singers.length === 1 ? "person" : "people"}.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the singer list.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setResetting(true);
    try {
      setOrder(await resetOrder());
      setConfirmOpen(false);
      toast.success("Singing order reset. Every singer can pick a new number.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not reset the singing order.");
    } finally {
      setResetting(false);
    }
  }

  const claimed = order?.entries.length ?? 0;
  const claimedBy = new Map(order?.entries.map((entry) => [entry.email, entry]) ?? []);
  const unclaimed = order?.singers.filter((email) => !claimedBy.has(email)) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Singing Order (Finals)</CardTitle>
        <CardDescription>
          Only the singers listed below can pick a number, from 1 to the number of singers. They sign in on the
          singing order page, enter their name, and get one random number each. Singers can&apos;t check in, but
          they&apos;re always in the lucky draw. Claims are saved to the Singing Order (Finals) tab of the Variables
          spreadsheet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="singer-emails">Singers ({order?.singers.length ?? 0})</Label>
          <Textarea
            id="singer-emails"
            value={draft}
            onChange={(event) => setEdited(event.target.value)}
            placeholder={"one@ucsb.edu\ntwo@ucsb.edu"}
            className="max-h-64 font-mono"
            disabled={disabled || !order}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void saveSingers()} disabled={disabled || !order || saving || edited === null}>
              {saving ? "Saving…" : "Save singer list"}
            </Button>
            {edited !== null ? (
              <Button variant="ghost" onClick={() => setEdited(null)} disabled={saving}>
                Discard changes
              </Button>
            ) : null}
            <span className="text-sm text-muted-foreground">
              One @ucsb.edu email per line, or separated by commas. Saving replaces the whole list.
            </span>
          </div>
          {unclaimed.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Not picked yet: <span className="text-foreground">{unclaimed.join(", ")}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button variant="outline" nativeButton={false} render={<Link href="/random-order" />}>
            Open singing order page
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={disabled || loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={disabled || !order || claimed === 0}>
            Reset
          </Button>
          {order ? (
            <span className="text-sm text-muted-foreground">
              {claimed} claimed · {order.remaining} left
            </span>
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {order && claimed > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Claimed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.entries.map((entry) => (
                <TableRow key={entry.number}>
                  <TableCell className="font-heading text-primary tabular-nums">{entry.number}</TableCell>
                  <TableCell className="max-w-40 truncate">{entry.name}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{entry.email}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatWhen(entry.claimedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : order ? (
          <p className="text-sm text-muted-foreground">Nobody has picked a number yet.</p>
        ) : null}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !resetting && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the singing order?</AlertDialogTitle>
            <AlertDialogDescription>
              All {claimed} numbers are released and the next person to pick starts a new shuffle. The current list
              is kept in the spreadsheet as a renamed tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={resetting} onClick={() => void reset()}>
              {resetting ? "Resetting…" : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
