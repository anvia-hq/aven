export function withoutNul<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll("\u0000", "") as T;

  if (Array.isArray(value)) return value.map(withoutNul) as T;

  if (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [withoutNul(key), withoutNul(item)]),
    ) as T;

  return value;
}
