import { describe, expect, test } from "bun:test";

import { projectInitial, tileStyle } from "./tile";

describe("projectInitial", () => {
  test("is the first letter or digit, in capitals", () => {
    expect(projectInitial("aven")).toBe("A");
    expect(projectInitial("  my-app")).toBe("M");
    expect(projectInitial("-_-7up")).toBe("7");
    expect(projectInitial("élan")).toBe("É");
  });

  test("is a question mark for a name with no letter or digit", () => {
    expect(projectInitial("")).toBe("?");
    expect(projectInitial("---")).toBe("?");
  });
});

describe("tileStyle", () => {
  test("is the same for a project every time", () => {
    expect(tileStyle("project-1")).toEqual(tileStyle("project-1"));
  });

  test("draws a diagonal gradient between two colors", () => {
    expect(tileStyle("project-1").backgroundImage).toMatch(
      /^linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/,
    );
  });

  test("gives projects different colors, not one for all", () => {
    const seen = new Set(
      Array.from({ length: 40 }, (_, index) => tileStyle(`id-${index}`).backgroundImage),
    );
    expect(seen.size).toBeGreaterThan(5);
  });
});
