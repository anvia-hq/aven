import { createHmac } from "node:crypto";

export function browserConfig(env: Record<string, string | undefined> = process.env) {
  const origin = env.AVEN_BROWSER_ORIGIN?.trim().replace(/\/+$/, "") || undefined;
  if (origin && !/^https?:\/\/[^/]+$/.test(origin)) {
    throw new Error(
      `AVEN_BROWSER_ORIGIN must be an address such as https://host:8444, got "${origin}"`,
    );
  }
  const aven = [env.BETTER_AUTH_URL, ...(env.TRUSTED_ORIGINS ?? "").split(",")]
    .map((address) => address?.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (origin && aven.includes(origin)) {
    throw new Error(
      `AVEN_BROWSER_ORIGIN must be another origin than Aven's own (${origin}): a page of the sandbox would run as Aven`,
    );
  }
  const port = Number(env.AVEN_BROWSER_PORT ?? 8001);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`AVEN_BROWSER_PORT must be a port number, got "${env.AVEN_BROWSER_PORT}"`);
  }
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return {
    origin,
    port,
    hostname: env.AVEN_BROWSER_BIND?.trim() || "127.0.0.1",
    secure: origin?.startsWith("https:") ?? false,
    secret: createHmac("sha256", secret).update("aven:browser").digest(),
  };
}
