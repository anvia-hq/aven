import { describe, expect, test } from "bun:test";

import { IDENTITY, multiply, turnAbout, viewAt } from "./rotation";
import type { Mat3 } from "./types";

const near = (left: Mat3, right: Mat3) =>
  left.every((row, r) => row.every((value, c) => Math.abs(value - right[r]![c]!) < 1e-9));

const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];

describe("rotation", () => {
  test("stays a pure rotation however long it turns, so the cube never shears", () => {
    for (const turn of [0, 0.37, 55, 4000]) {
      const view = viewAt(turn);
      expect(near(multiply(view, transpose(view)), IDENTITY)).toBe(true);
    }
  });

  test("turning about an axis and back is no turn at all", () => {
    expect(near(multiply(turnAbout("y", 0.8), turnAbout("y", -0.8)), IDENTITY)).toBe(true);
  });

  test("the view after a whole turn is the view it started from", () => {
    expect(near(viewAt(3), viewAt(0))).toBe(true);
  });
});
