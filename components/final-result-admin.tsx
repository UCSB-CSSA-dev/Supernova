"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchFinalResult, setFinalResult } from "@/lib/backend";
import type { FinalAward, FinalAwards } from "@/lib/types";

const FIELDS: { award: FinalAward; label: string }[] = [
  { award: "gold", label: "Gold" },
  { award: "silver", label: "Silver" },
  { award: "bronze", label: "Bronze" },
  { award: "popular", label: "Popular" },
];

export function FinalResultAdmin({ disabled }: { disabled?: boolean }) {
  const [saved, setSaved] = useState<FinalAwards | null>(null);
  // null until the admin starts editing, so a refresh shows the saved names.
  const [edited, setEdited] = useState<FinalAwards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const draft = edited ?? saved;

  async function load() {
    setLoading(true);
    try {
      setSaved((await fetchFinalResult()).awards);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the final result.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (disabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [disabled]);

  async function save() {
    if (!edited) return;
    setSaving(true);
    try {
      setSaved((await setFinalResult(edited)).awards);
      setEdited(null);
      toast.success("Final result saved.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the final result.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>5. Final result</CardTitle>
        <CardDescription>
          The names shown on the final result screen. Nothing appears there until you press Release, which reveals
          bronze, then silver, then popular, then gold. Each release reads the latest saved names, so you can still fix a
          name until it is revealed. Saved to the Variables spreadsheet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(({ award, label }) => (
            <div key={award} className="space-y-1.5">
              <Label htmlFor={`final-${award}`}>{label}</Label>
              <Input
                id={`final-${award}`}
                value={draft?.[award] ?? ""}
                maxLength={80}
                onChange={(event) => {
                  const base = edited ?? saved;
                  if (base) setEdited({ ...base, [award]: event.target.value });
                }}
                placeholder="Name"
                disabled={disabled || !saved}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={disabled || !saved || saving || edited === null}>
            {saving ? "Saving…" : "Save final result"}
          </Button>
          {edited !== null ? (
            <Button variant="ghost" onClick={() => setEdited(null)} disabled={saving}>
              Discard changes
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void load()} disabled={disabled || loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/final-result" />}>
            Open final result screen
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
