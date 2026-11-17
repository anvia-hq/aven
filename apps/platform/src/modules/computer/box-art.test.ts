import { describe, expect, test } from "bun:test";

import { DOTS } from "../projects/orb-art";
import { boxRotation, boxShape, IDENTITY, multiply, paintBox, turnAbout } from "./box-art";
import type { BoxAxis, Mat3 } from "./types";

const near = (left: Mat3, right: Mat3) =>
  left.every((row, r) => row.every((value, c) => Math.abs(value - right[r]![c]!) < 1e-9));

const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];

describe("boxShape", () => {
  test("is the same for a seed every time and differs between projects", () => {
    expect(boxShape(42)).toEqual(boxShape(42));
    const looks = new Set(
      Array.from({ length: 40 }, (_, seed) => JSON.stringify(boxShape(seed + 1).half)),
    );
    expect(looks.size).toBe(40);
  });

  test("has two or three inner frames and the orb's dust", () => {
    for (let seed = 1; seed < 40; seed++) {
      const shape = boxShape(seed);
      expect(shape.frames.length).toBeGreaterThanOrEqual(2);
      expect(shape.frames.length).toBeLessThanOrEqual(3);
      expect(shape.orb.dots).toHaveLength(DOTS);
    }
  });
});

describe("boxRotation", () => {
  const axes: BoxAxis[] = ["tumble", "x", "y", "z"];

  test("stays a pure rotation however long it turns, so the cube never shears", () => {
    const shape = boxShape(9);
    for (const axis of axes) {
      for (const time of [0, 1.7, 55, 4000]) {
        const turned = boxRotation(shape, time, axis);
        expect(near(multiply(turned, transpose(turned)), IDENTITY)).toBe(true);
      }
    }
  });

  test("turning about an axis and back is no turn at all", () => {
    expect(near(multiply(turnAbout("y", 0.8), turnAbout("y", -0.8)), IDENTITY)).toBe(true);
  });
});

function drawn(seed: number, color: number) {
  let circles = 0;
  const answers: Record<string, unknown> = { arc: () => circles++ };
  const context = new Proxy(
    {},
    { get: (_, key) => answers[String(key)] ?? (() => {}), set: () => true },
  ) as CanvasRenderingContext2D;
  const shape = boxShape(seed);
  paintBox(context, 40, shape, {
    ink: [120, 120, 120],
    colors: ["#ff6a3d", "#ffb347", "#ff3d7f"],
    color,
    time: 3,
    rotation: boxRotation(shape, 3, "tumble"),
  });
  return circles;
}

describe("paintBox", () => {
  test("a box at rest has no dust and a working one has a halo and a core for every speck", () => {
    for (let seed = 1; seed < 10; seed++) {
      expect(drawn(seed, 0)).toBe(0);
      expect(drawn(seed, 1)).toBe(DOTS * 2);
    }
  });
});
