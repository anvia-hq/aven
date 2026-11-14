export function parseOrigins(value: string) {
  return value.split(",").flatMap((origin) => {
    const trimmed = origin.trim();
    return trimmed === "" ? [] : [trimmed];
  });
}
