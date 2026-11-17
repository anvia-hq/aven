export function featureChoice<T extends string>(
  name: string,
  configured: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = configured?.trim() || fallback;
  const found = allowed.find((candidate) => candidate === value);

  if (found !== undefined) return found;

  throw new Error(`${name} must be ${allowed.join(" or ")}, got "${value}"`);
}
