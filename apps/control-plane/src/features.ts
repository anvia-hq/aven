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

export function featureList<T extends string>(
  name: string,
  configured: string | undefined,
  allowed: readonly T[],
): T[] {
  const names = (configured ?? "").split(",").flatMap((entry) => {
    const trimmed = entry.trim();

    return trimmed === "" ? [] : [trimmed];
  });
  const unknown = names.filter((entry) => !allowed.some((candidate) => candidate === entry));

  if (unknown.length > 0)
    throw new Error(
      `${name} names ${unknown.join(", ")}, which is not one of ${allowed.join(", ")}`,
    );

  return allowed.filter((candidate) => names.includes(candidate));
}
