export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
}

export class UnprocessableError extends Error {
  override readonly name = "UnprocessableError";
}

export class UnavailableError extends Error {
  override readonly name = "UnavailableError";
}

export class ConflictError extends Error {
  override readonly name = "ConflictError";
}

export class ForbiddenError extends Error {
  override readonly name = "ForbiddenError";
}

export function orNotFound<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new NotFoundError(message);

  return value;
}

export const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
