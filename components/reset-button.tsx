"use client";

import { useState, type ReactNode } from "react";
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

export function ResetButton({
  label,
  title,
  description,
  success,
  disabled,
  onReset,
}: {
  label: string;
  title: string;
  description: ReactNode;
  success: string;
  disabled?: boolean;
  onReset: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function reset() {
    setResetting(true);
    try {
      await onReset();
      setOpen(false);
      toast.success(success);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not reset. Try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)} disabled={disabled}>
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !resetting && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={resetting} onClick={() => void reset()}>
              {resetting ? "Resetting…" : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
