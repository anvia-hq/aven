import { expect, test } from "bun:test";

import { explainMachineCallError, UPDATE_RUNNER } from "./machine-call-error";

test("an old runner's unknown call says to update it", () => {
  expect(() => explainMachineCallError(new Error("Unknown call machine.call"))).toThrow(
    UPDATE_RUNNER,
  );
  expect(() => explainMachineCallError(new Error("unknown call"))).toThrow(UPDATE_RUNNER);
});

test("any other failure from the machine is left as it is", () => {
  const failure = new Error("Could not list files");
  expect(() => explainMachineCallError(failure)).toThrow(failure);
  expect(() => explainMachineCallError("The computer is offline")).toThrow(
    "The computer is offline",
  );
});
