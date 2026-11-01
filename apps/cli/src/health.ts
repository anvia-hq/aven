/** Polls a URL until it answers with a success status; false if it never does within the time. */
export async function waitForHealthy(
  url: string,
  { timeoutMs = 90_000, intervalMs = 2_000, fetchFn = fetch, sleep = Bun.sleep } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      if ((await fetchFn(url, { signal: AbortSignal.timeout(3_000) })).ok) return true;
    } catch {
      // Not up yet.
    }
    if (Date.now() + intervalMs > deadline) return false;
    await sleep(intervalMs);
  }
}

/** Whether nothing is listening on the port, so a server can be published on it. */
export function portIsFree(port: number) {
  try {
    Bun.listen({ hostname: "0.0.0.0", port, socket: { data() {} } }).stop(true);
    return true;
  } catch {
    return false;
  }
}
