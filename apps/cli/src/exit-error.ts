export class CliExitError extends Error {
  constructor(
    readonly code: number,
    message = "",
  ) {
    super(message);
  }
}
