import { describe, expect, test } from "bun:test";

import { tileColors, tilePalettes } from "./tile";

describe("tileColors", () => {
  test("is the same for a project every time", () => {
    expect(tileColors("project-1")).toEqual(tileColors("project-1"));
  });

  test("gives three colors", () => {
    for (const color of tileColors("project-1")) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("tilePalettes", () => {
  const twins = ["e10b6307-ab40-49eb-958f-929445d72a80", "8426ffae-0657-464f-95e8-e9a56327b4a6"];

  test("two ids that hash to one palette are given two", () => {
    expect(tileColors(twins[0]!)).toEqual(tileColors(twins[1]!));
    const palettes = tilePalettes(twins);
    expect(palettes.get(twins[0]!)).not.toBe(palettes.get(twins[1]!));
  });

  test("the first six projects all differ, whatever their ids", () => {
    for (let run = 0; run < 20; run++) {
      const ids = Array.from({ length: 6 }, (_, index) => `run-${run}-project-${index}`);
      expect(new Set(tilePalettes(ids).values()).size).toBe(6);
    }
  });

  test("a project keeps its palette when a newer one is added", () => {
    const before = tilePalettes(["a", "b", "c"]);
    const after = tilePalettes(["a", "b", "c", "d"]);
    for (const id of ["a", "b", "c"]) expect(after.get(id)).toBe(before.get(id));
  });

  test("past six projects the palettes are shared out evenly", () => {
    const counts = new Map<number, number>();
    for (const palette of tilePalettes(Array.from({ length: 25 }, (_, i) => `p-${i}`)).values()) {
      counts.set(palette, (counts.get(palette) ?? 0) + 1);
    }
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
  });

  test("a palette given to the tile is the one drawn", () => {
    const palettes = tilePalettes(twins);
    const drawn = twins.map((id) => tileColors(id, palettes.get(id)));
    expect(drawn[0]).not.toEqual(drawn[1]);
    expect(tileColors("x", palettes.get(twins[1]!))).toEqual(drawn[1]!);
  });
});
