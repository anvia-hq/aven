// Reading values whose shape nobody promised: JSON from a journal, a tool's result, a thrown error.

/** The value's fields when it is an object, otherwise none. */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/**
 * What went wrong, in words, whatever was thrown. A wrapper's own message can say nothing ("Memory
 * compaction model request failed."), so the error it wraps is added when it has one.
 */
export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : "";
  return cause && !error.message.includes(cause) ? `${error.message} ${cause}` : error.message;
}
