const lastRun = new Map<string, number>();

export function throttled(key: string, intervalMs: number, action: () => void): void {
  const now = Date.now();
  if (now - (lastRun.get(key) ?? 0) < intervalMs) return;
  lastRun.set(key, now);
  action();
}
