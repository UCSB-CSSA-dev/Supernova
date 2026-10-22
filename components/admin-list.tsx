"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addAdmin, removeAdmin } from "@/lib/backend";
import type { AdminList as AdminListData } from "@/lib/types";

export function AdminList({
  admins,
  isOwner,
  onChange,
}: {
  admins: AdminListData;
  isOwner: boolean;
  onChange: (admins: AdminListData) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(target: string, action: () => Promise<AdminListData>, message: string) {
    setBusy(target);
    try {
      onChange(await action());
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update admins.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    if (await run("add", () => addAdmin(value), `${value} is now an admin.`)) setEmail("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admins</CardTitle>
        <CardDescription>
          Admins sign in with Google. Any admin can add another @ucsb.edu admin. {admins.owner} is always an admin
          and is the only one who can remove admins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span className="truncate">{admins.owner}</span>
            <Badge>Owner</Badge>
          </li>
          {admins.trusted.map((admin) => (
            <li key={admin} className="flex items-center justify-between gap-3">
              <span className="truncate">{admin}</span>
              {isOwner ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void run(admin, () => removeAdmin(admin), `${admin} removed.`)}
                >
                  {busy === admin ? "Removing…" : "Remove"}
                </Button>
              ) : (
                <Badge variant="secondary">Trusted</Badge>
              )}
            </li>
          ))}
        </ul>
        <form className="flex gap-2 border-t pt-4" onSubmit={(event) => void onAdd(event)}>
          <Input
            type="email"
            placeholder="name@ucsb.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="Admin email"
          />
          <Button type="submit" disabled={busy !== null || !email.trim()}>
            {busy === "add" ? "Adding…" : "Add admin"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
