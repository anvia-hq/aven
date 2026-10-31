import { describe, expect, test } from "bun:test";

import { environmentInstructions } from "./environment";

describe("environmentInstructions", () => {
  test("names the variables and says what to do with them", () => {
    const text = environmentInstructions(["DATABASE_URL", "API_KEY"]);
    expect(text).toContain("Variables: DATABASE_URL, API_KEY");
    expect(text).toContain("do not copy their values");
  });

  test("says nothing without variables", () => {
    expect(environmentInstructions([])).toBe("");
  });
});
