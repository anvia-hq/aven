import { describe, expect, test } from "bun:test";

import { recordingContext } from "../marks/recording-context";
import { DOTS, markColors, paintOrb } from "./orb-art";

function drawn(color: number, turn: number) {
  const { context, calls } = recordingContext();
  paintOrb(context, 40, {
    ink: [120, 120, 120],
    colors: ["#ff6a3d", "#ffb347", "#ff3d7f"],
    color,
    turn,
  });
  return calls;
}

const circles = (calls: string[]) => calls.filter((call) => call.startsWith("arc ")).length;

describe("paintOrb", () => {
  test("a mark at rest is the glass and the rim, with no dust", () => {
    expect(circles(drawn(0, 0))).toBe(2);
  });

  test("a working mark adds a halo and a core for every speck of dust", () => {
    expect(circles(drawn(1, 0.3))).toBe(2 + DOTS * 2);
  });

  test("a mark at rest looks the same after any whole number of turns", () => {
    const start = drawn(0, 0);
    for (const turns of [1, 2, 7]) expect(drawn(0, turns)).toEqual(start);
  });

  test("a working mark looks different part way through a turn", () => {
    expect(drawn(1, 0.35)).not.toEqual(drawn(1, 0));
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
