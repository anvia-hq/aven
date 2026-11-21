export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asRecord = (value: unknown): Record<string, unknown> =>
  isPlainObject(value) ? value : {};

export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause instanceof Error ? error.cause.message : "";
  return cause && !error.message.includes(cause) ? `${error.message} ${cause}` : error.message;
}
