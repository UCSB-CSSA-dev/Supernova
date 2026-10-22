"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell title="Something went wrong">
      <p className="mt-8 text-destructive">{error.message || "This page couldn't load."}</p>
      <div className="mt-4 flex gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </PageShell>
  );
}
