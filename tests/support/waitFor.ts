/** Polls until a condition holds, or fails with a clear message. Prefer this to a fixed sleep. */
export async function waitFor(
  check: () => Promise<boolean> | boolean,
  timeoutMs = 5_000,
  intervalMs = 20,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs} ms`);
}
