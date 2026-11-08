export function parseOrigins(value: string) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
}
