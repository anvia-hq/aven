export function pairingUrlOf(origin: string, code: string) {
  const base = origin.replace(/\/+$/, "");
  const url = new URL("aven://pair");
  url.searchParams.set("server", `${base}/api`);
  url.searchParams.set("code", code);
  return url.toString();
}

export function remainingSecondsOf(expiresAt: string, nowMs = Date.now()) {
  const diffMs = Date.parse(expiresAt) - nowMs;

  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;

  return Math.ceil(diffMs / 1000);
}

export function formatCountdown(seconds: number) {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const remainder = clamped % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
