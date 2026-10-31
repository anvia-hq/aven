import { describe, expect, test } from "bun:test";

import { errorMessage } from "./values";

describe("errorMessage", () => {
  test("is an error's message, or whatever else was thrown as text", () => {
    expect(errorMessage(new Error("the model is down"))).toBe("the model is down");
    expect(errorMessage("plain text")).toBe("plain text");
  });

  test("adds what a wrapping error was caused by, so a vague message says why", () => {
    const wrapped = new Error("Memory compaction model request failed.", {
      cause: new Error("400 Unsupported parameter: 'temperature'"),
    });
    expect(errorMessage(wrapped)).toBe(
      "Memory compaction model request failed. 400 Unsupported parameter: 'temperature'",
    );
  });

  test("does not say a cause twice, and ignores a cause that is not an error", () => {
    expect(errorMessage(new Error("failed: boom", { cause: new Error("boom") }))).toBe(
      "failed: boom",
    );
    expect(errorMessage(new Error("failed", { cause: "boom" }))).toBe("failed");
  });
});
