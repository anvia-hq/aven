import { describe, expect, test } from "bun:test";

import { recordingContext } from "../marks/recording-context";
import { DOTS } from "../projects/orb-art";
import { paintBox } from "./box-art";

function drawn(color: number, turn: number) {
  const { context, calls } = recordingContext();
  paintBox(context, 40, {
    ink: [120, 120, 120],
    colors: ["#ff6a3d", "#ffb347", "#ff3d7f"],
    color,
    turn,
  });
  return calls;
}

const count = (calls: string[], prefix: string) =>
  calls.filter((call) => call.startsWith(prefix)).length;

describe("paintBox", () => {
  test("a box at rest has no dust and a working one has a halo and a core for every speck", () => {
    expect(count(drawn(0, 0), "arc ")).toBe(0);
    expect(count(drawn(1, 0.3), "arc ")).toBe(DOTS * 2);
  });

  test("draws the cube's twelve edges and nothing inside it", () => {
    expect(count(drawn(1, 0.3), "stroke ")).toBe(12);
  });

  test("a box at rest looks the same after any whole number of turns", () => {
    const start = drawn(0, 0);
    for (const turns of [1, 2, 7]) expect(drawn(0, turns)).toEqual(start);
  });

  test("a working box looks different part way through a turn", () => {
    expect(drawn(1, 0.2)).not.toEqual(drawn(1, 0));
  });
});
