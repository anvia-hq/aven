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

type Listen = (options: { hostname: string; port: number }) => { stop(close?: boolean): void };

const bindToProbe: Listen = ({ hostname, port }) =>
  Bun.listen({ hostname, port, socket: { data() {} } });

export function portIsFree(port: number, listen: Listen = bindToProbe) {
  for (const hostname of ["0.0.0.0", "127.0.0.1"]) {
    try {
      listen({ hostname, port }).stop(true);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EACCES") return false;
    }
  }
  return true;
}
