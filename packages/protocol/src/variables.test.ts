import { describe, expect, test } from "bun:test";

import { isReservedName, NAME_PATTERN, VARIABLE_NAME } from "./variables";

describe("variable names", () => {
  test("the pattern and the expression accept the same names", () => {
    expect(VARIABLE_NAME.source).toBe(`^${NAME_PATTERN}$`);
  });

  test.each([
    "PATH",
    "path",
    "HOME",
    "USER",
    "SHELL",
    "PWD",
    "LD_PRELOAD",
    "AVEN_URL",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GIT_DIR",
  ])("refuses the reserved name %p", (name) => {
    expect(isReservedName(name)).toBe(true);
  });

  test.each(["PATHS", "GITLAB_TOKEN", "AVENUE", "HOMEPAGE", "DATABASE_URL"])(
    "allows %p",
    (name) => {
      expect(isReservedName(name)).toBe(false);
    },
  );
});
