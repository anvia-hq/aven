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

/**
 * Whether nothing is listening on the port, so a server can be published on it. Both the wildcard
 * and loopback are tried: a process bound to 127.0.0.1 alone (the API port of another Aven, a
 * published container) does not stop a bind to 0.0.0.0 on macOS, but it does stop Docker's.
 */
export function portIsFree(port: number) {
  for (const hostname of ["0.0.0.0", "127.0.0.1"]) {
    try {
      Bun.listen({ hostname, port, socket: { data() {} } }).stop(true);
    } catch {
      return false;
    }
  }
  return true;
}
