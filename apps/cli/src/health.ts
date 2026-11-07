export async function waitForHealthy(
  url: string,
  { timeoutMs = 90_000, intervalMs = 2_000, fetchFn = fetch, sleep = Bun.sleep } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      if ((await fetchFn(url, { signal: AbortSignal.timeout(3_000) })).ok) return true;
    } catch {}
    if (Date.now() + intervalMs > deadline) return false;
    await sleep(intervalMs);
  }
}

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
