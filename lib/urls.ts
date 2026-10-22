import { useSyncExternalStore } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function subscribe(): () => void {
  return () => undefined;
}

// Full URL for printing into a QR code; empty during prerender.
export function useAppUrl(path: string): string {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  return origin ? `${origin}${basePath}${path}` : "";
}
