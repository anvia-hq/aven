const VERSION = /^\d+(\.\d+){0,2}$/;

export const serverBuild = (env: string | undefined = process.env.AVEN_VERSION) =>
  env !== undefined && VERSION.test(env) ? env : undefined;

const parts = (version: string) => version.split(".").map(Number);

export function isBehind(runner: string | undefined, server: string | undefined) {
  if (!runner || !server || !VERSION.test(runner) || !VERSION.test(server)) return false;
  const [a, b] = [parts(runner), parts(server)];
  for (let i = 0; i < 3; i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];
    if (x !== y) return x < y;
  }
  return false;
}
