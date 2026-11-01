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

  test("blends a base color with three accents under a light from above", () => {
    const style = tileStyle("project-1");
    expect(style.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
    const layers = style.backgroundImage.split(/, (?=linear|radial)/);
    expect(layers.map((layer) => layer.split("(")[0])).toEqual([
      "linear-gradient",
      "radial-gradient",
      "radial-gradient",
      "radial-gradient",
    ]);
  });

  test("gives projects different looks, not one for all", () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, index) => tileStyle(`id-${index}`).backgroundImage),
    );
    // Ten palettes turned four ways: forty looks, most of which 200 ids will have met.
    expect(seen.size).toBeGreaterThan(25);
  });
});
