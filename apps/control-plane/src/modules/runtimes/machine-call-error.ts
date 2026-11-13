import { describeError } from "@aven/server-kit/errors";

export const UPDATE_RUNNER = "Update this computer's runner to use its tools";

export function explainMachineCallError(error: unknown): never {
  if (/unknown call/i.test(describeError(error))) throw new Error(UPDATE_RUNNER);

  throw error;
}
