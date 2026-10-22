import type { TimeWindow } from "./types.ts";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Value for <input type="datetime-local">, in the browser's time zone.
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function describeWindow(window: TimeWindow, label: string): string {
  switch (window.phase) {
    case "open":
      return window.closesAt ? `${label} is open until ${formatWhen(window.closesAt)}.` : `${label} is open.`;
    case "scheduled":
      return `${label} opens ${formatWhen(window.opensAt)}.`;
    case "closed":
      return `${label} has closed.`;
    default:
      return `${label} is not open yet.`;
  }
}

// Keeps enough of the address for a winner to recognize it on the projector.
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.length <= 3 ? local.slice(0, 1) : local.slice(0, 3);
  return `${visible}${"•".repeat(Math.max(2, Math.min(5, local.length - visible.length)))}@${domain}`;
}
