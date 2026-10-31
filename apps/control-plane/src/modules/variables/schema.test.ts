import { describe, expect, test } from "bun:test";

import { setVariableBody, variableName } from "./schema";

describe("variableName", () => {
  test.each(["DATABASE_URL", "_private", "api_key2", "a"])("accepts %p", (name) => {
    expect(variableName.safeParse(name).success).toBe(true);
  });

  test.each(["", "1ABC", "A-B", "A B", "A=B", "a".repeat(129)])("refuses %p", (name) => {
    expect(variableName.safeParse(name).success).toBe(false);
  });

  test.each([
    "PATH",
    "path",
    "HOME",
    "LD_PRELOAD",
    "AVEN_URL",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GIT_DIR",
  ])("refuses the reserved name %p", (name) => {
    expect(variableName.safeParse(name).success).toBe(false);
  });

  test("a name that only starts like a reserved one is fine", () => {
    for (const name of ["PATHS", "GITLAB_TOKEN", "AVENUE", "HOMEPAGE"]) {
      expect(variableName.safeParse(name).success).toBe(true);
    }
  });
});

describe("setVariableBody", () => {
  test("a variable is not a secret unless it says so", () => {
    expect(setVariableBody.parse({ value: "x" })).toEqual({ value: "x", secret: false });
  });

  test("an empty value is allowed, one over the limit is not", () => {
    expect(setVariableBody.safeParse({ value: "" }).success).toBe(true);
    expect(setVariableBody.safeParse({ value: "x".repeat(8193) }).success).toBe(false);
  });
});
