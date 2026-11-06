import { describe, expect, test } from "bun:test";

import { DOTS, orbShape } from "./orb-art";

describe("orbShape", () => {
  test("is the same for a seed every time", () => {
    expect(orbShape(42)).toEqual(orbShape(42));
  });

  test("differs between projects", () => {
    const looks = new Set(
      Array.from({ length: 50 }, (_, seed) => JSON.stringify(orbShape(seed + 1).rings)),
    );
    expect(looks.size).toBe(50);
  });

  test("has two or three rings and a fixed amount of dust", () => {
    for (let seed = 1; seed < 40; seed++) {
      const shape = orbShape(seed);
      expect(shape.rings.length).toBeGreaterThanOrEqual(2);
      expect(shape.rings.length).toBeLessThanOrEqual(3);
      expect(shape.dots).toHaveLength(DOTS);
    }
  });
});
