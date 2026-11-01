import { describe, expect, test } from "bun:test";

import { projectInitial, tilePalettes, tileStyle } from "./tile";

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

describe("tilePalettes", () => {
  // The two projects of a real install: their ids hash to the same palette.
  const twins = ["94f2e296-0110-4638-a704-83bd184b151e", "4b52c634-8f6e-4a9e-b588-fef8b91a5c55"];

  test("two ids that hash to one palette are given two", () => {
    expect(tileStyle(twins[0]!).backgroundColor).toBe(tileStyle(twins[1]!).backgroundColor);
    const palettes = tilePalettes(twins);
    expect(palettes.get(twins[0]!)).not.toBe(palettes.get(twins[1]!));
  });

  test("the first ten projects all differ, whatever their ids", () => {
    for (let run = 0; run < 20; run++) {
      const ids = Array.from({ length: 10 }, (_, index) => `run-${run}-project-${index}`);
      expect(new Set(tilePalettes(ids).values()).size).toBe(10);
    }
  });

  test("a project keeps its palette when a newer one is added", () => {
    const before = tilePalettes(["a", "b", "c"]);
    const after = tilePalettes(["a", "b", "c", "d"]);
    for (const id of ["a", "b", "c"]) expect(after.get(id)).toBe(before.get(id));
  });

  test("past ten projects the palettes are shared out evenly", () => {
    const counts = new Map<number, number>();
    for (const palette of tilePalettes(Array.from({ length: 25 }, (_, i) => `p-${i}`)).values()) {
      counts.set(palette, (counts.get(palette) ?? 0) + 1);
    }
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
  });

  test("a palette given to the tile is the one drawn", () => {
    expect(tileStyle("x", 0).backgroundColor).not.toBe(tileStyle("x", 1).backgroundColor);
  });
});
