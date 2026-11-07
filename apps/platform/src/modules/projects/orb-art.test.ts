import { describe, expect, test } from "bun:test";

import { DOTS, orbShape, paintOrb } from "./orb-art";

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

function circlesDrawn(seed: number, color: number, time: number) {
  let circles = 0;
  const gradient = { addColorStop() {} };
  const answers: Record<string, unknown> = {
    arc: () => circles++,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
  };
  const context = new Proxy(
    {},
    { get: (_, key) => answers[String(key)] ?? (() => {}), set: () => true },
  ) as CanvasRenderingContext2D;
  paintOrb(context, 40, orbShape(seed), {
    ink: [120, 120, 120],
    colors: ["#ff6a3d", "#ffb347", "#ff3d7f"],
    color,
    time,
  });
  return circles;
}

describe("paintOrb", () => {
  test("a mark at rest is the ring and its glass, with no dust", () => {
    for (let seed = 1; seed < 20; seed++) expect(circlesDrawn(seed, 0, 3)).toBe(2);
  });

  test("a working mark adds a halo and a core for every speck of dust", () => {
    for (let seed = 1; seed < 20; seed++) expect(circlesDrawn(seed, 1, 3)).toBe(2 + DOTS * 2);
  });

  test("dust fades in with the color, so one just starting to work already has it", () => {
    expect(circlesDrawn(1, 0.05, 0)).toBe(2 + DOTS * 2);
  });
});
