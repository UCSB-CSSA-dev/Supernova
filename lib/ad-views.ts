const KEY = "supernova-ad-views";
const MAX_QUEUED = 20;

function read(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function write(views: string[]): void {
  try {
    if (views.length) window.localStorage.setItem(KEY, JSON.stringify(views.slice(-MAX_QUEUED)));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable (private mode, in-app browsers); losing a count is fine.
  }
}

export function queueAdView(ad: string): void {
  write([...read(), ad]);
}

export function hasQueuedAdViews(): boolean {
  return read().length > 0;
}

export function takeAdViews(): string[] {
  if (typeof window === "undefined") return [];
  const views = read();
  if (views.length) write([]);
  return views;
}

export function returnAdViews(views: string[]): void {
  if (views.length) write([...views, ...read()]);
}
