// Reading values whose shape nobody promised: JSON from a journal, a tool's result, a thrown error.

/** The value's fields when it is an object, otherwise none. */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** What went wrong, in words, whatever was thrown. */
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
