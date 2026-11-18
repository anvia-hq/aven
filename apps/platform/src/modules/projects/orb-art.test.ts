import { describe, expect, test } from "bun:test";

import { DOTS, markColors, orbShape, paintOrb } from "./orb-art";

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

describe("markColors", () => {
  test("keeps the color it is given and pads the lighter and the darker blend", () => {
    const [own, lighter, darker] = markColors("#14b8a6");
    expect(own).toBe("#14b8a6");
    for (const color of [lighter, darker]) expect(color).toMatch(/^#[0-9a-f]{6}$/);

    const channels = (hex: string) =>
      [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
    expect(channels(lighter)[0]).toBeGreaterThan(channels(darker)[0]!);
  });

  test("a color at the edge still writes six digits", () => {
    for (const hex of ["#000000", "#ffffff"]) {
      for (const color of markColors(hex)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
