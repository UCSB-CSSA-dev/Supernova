"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setWindow } from "@/lib/backend";
import { describeWindow, fromLocalInput, toLocalInput } from "@/lib/format";
import type { TimeWindow, WindowName } from "@/lib/types";

const PHASE_LABEL: Record<TimeWindow["phase"], string> = {
  unscheduled: "Not scheduled",
  scheduled: "Scheduled",
  open: "Open",
  closed: "Closed",
};

export function WindowControl({
  name,
  label,
  window: current,
  disabled,
  leadMinutes,
  onChange,
}: {
  name: WindowName;
  label: string;
  window: TimeWindow;
  disabled?: boolean;
  // Offers "Open in N min" so waiting phones learn the time in advance and open on their own.
  leadMinutes?: number;
  onChange: (next: TimeWindow) => void;
}) {
  const [opens, setOpens] = useState(() => toLocalInput(current.opensAt));
  const [closes, setCloses] = useState(() => toLocalInput(current.closesAt));
  const [busy, setBusy] = useState(false);

  async function save(opensAt: string | null, closesAt: string | null, message: string) {
    setBusy(true);
    try {
      const next = await setWindow(name, opensAt, closesAt);
      setOpens(toLocalInput(next.opensAt));
      setCloses(toLocalInput(next.closesAt));
      onChange(next);
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not update ${label.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  function openNow() {
    const now = new Date().toISOString();
    const keepClose = current.closesAt && current.closesAt > now ? current.closesAt : null;
    void save(now, keepClose, `${label} is open.`);
  }

  function openSoon(minutes: number) {
    const opensAt = new Date(Date.now() + minutes * 60000).toISOString();
    const keepClose = current.closesAt && current.closesAt > opensAt ? current.closesAt : null;
    void save(opensAt, keepClose, `${label} opens in ${minutes} minutes.`);
  }

  function closeNow() {
    const now = new Date().toISOString();
    if (current.opensAt && current.opensAt < now) void save(current.opensAt, now, `${label} closed.`);
    else void save(null, null, `${label} closed.`);
  }

  const locked = disabled || busy;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">{describeWindow(current, label)}</p>
        <Badge variant={current.phase === "open" ? "default" : "secondary"}>{PHASE_LABEL[current.phase]}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${name}-opens`}>Opens</Label>
          <Input id={`${name}-opens`} type="datetime-local" value={opens} onChange={(event) => setOpens(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${name}-closes`}>Closes (optional)</Label>
          <Input id={`${name}-closes`} type="datetime-local" value={closes} onChange={(event) => setCloses(event.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => void save(fromLocalInput(opens), fromLocalInput(closes), `${label} schedule saved.`)}
        >
          Save schedule
        </Button>
        {leadMinutes ? (
          <Button disabled={locked || current.phase === "open"} onClick={() => openSoon(leadMinutes)}>
            Open in {leadMinutes} min
          </Button>
        ) : null}
        <Button variant={leadMinutes ? "outline" : "default"} disabled={locked || current.phase === "open"} onClick={openNow}>
          Open now
        </Button>
        <Button variant="ghost" disabled={locked || current.phase === "closed" || current.phase === "unscheduled"} onClick={closeNow}>
          Close now
        </Button>
      </div>
    </div>
  );
}
