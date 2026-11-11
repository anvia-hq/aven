import { describe, expect, test } from "bun:test";

import { groupFailureNotice, toolFailureNotice } from "./tool-failure";

const UPDATE_RUNNER = "Update this computer's runner to use its tools";

describe("toolFailureNotice", () => {
  test("an old runner's unknown call says to update it", () => {
    expect(toolFailureNotice("Error: Unknown call machine.call")).toBe(UPDATE_RUNNER);
    expect(toolFailureNotice(`Error: ${UPDATE_RUNNER}`)).toBe(UPDATE_RUNNER);
  });

  test("a tool's own failure stays its own", () => {
    expect(toolFailureNotice("not found\n[exit 1]")).toBeUndefined();
    expect(toolFailureNotice(undefined)).toBeUndefined();
  });
});

describe("groupFailureNotice", () => {
  test("says to update when one of the tools hit an old runner", () => {
    expect(
      groupFailureNotice([
        { status: "done", output: "ok" },
        { status: "error", output: "Unknown call machine.call" },
      ]),
    ).toBe(UPDATE_RUNNER);
  });

  test("says nothing when the failures are the tools' own", () => {
    expect(groupFailureNotice([{ status: "error", output: "[exit 1]" }])).toBeUndefined();
  });
});
