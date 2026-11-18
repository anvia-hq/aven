import { describe, expect, test } from "bun:test";

import { families } from "./avatar";
import { DEPTH, frontDepth, outward, reach, SHAPES, shapeOf } from "./avatar-shapes";

describe("the shapes", () => {
  test("are the ones a bot can pick, each once", () => {
    expect(SHAPES.map((shape) => shape.name)).toEqual([...families]);
    expect(new Set(families).size).toBe(12);
  });

  test("a shape that does not exist is the first one", () => {
    expect(shapeOf("blob").name).toBe(SHAPES[0]!.name);
    expect(shapeOf("hexagon").name).toBe("hexagon");
  });

  for (const shape of SHAPES) {
    test(`${shape.name} holds its middle and its eyes, and ends in a closed surface`, () => {
      expect(shape.field(0, 0, 0)).toBeLessThan(0);
      expect(shape.field(8, 8, 8)).toBeGreaterThan(0);

      for (const side of [-1, 1]) {
        const x = shape.eye.x + side * shape.eye.gap;
        expect(shape.field(x, shape.eye.y, 0)).toBeLessThan(0);
        expect(frontDepth(shape.field, x, shape.eye.y)).toBeGreaterThan(0.4);
      }

      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ] as const) {
        const distance = reach(shape.field, dx, dy, dz);
        expect(distance).toBeGreaterThan(0.3);
        expect(distance).toBeLessThan(4);
        expect(Math.abs(shape.field(dx * distance, dy * distance, dz * distance))).toBeLessThan(
          1e-4,
        );
      }
    });
  }

  test("a surface normal points away from the body and the flattened depth is shorter than wide", () => {
    for (const shape of SHAPES) {
      const distance = reach(shape.field, 0, 0, 1);
      const normal = outward(shape.field, 0, 0, distance);
      expect(normal.z).toBeGreaterThan(0.9);
      expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 5);
    }

    expect(DEPTH).toBeLessThan(1);
  });
});
