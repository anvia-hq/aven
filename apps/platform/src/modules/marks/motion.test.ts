import { describe, expect, test } from "bun:test";

import { RAMP_SECONDS, restingMotion, stepMotion } from "./motion";
import type { Motion } from "./types";

const FRAME = 1 / 60;

function run(motion: Motion, seconds: number, working: boolean) {
  const turns: number[] = [];
  let state = motion;

  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    state = stepMotion(state, FRAME, working);
    turns.push(state.turn);
  }

  return { state, turns };
}

describe("stepMotion", () => {
  test("a mark that is not working stays exactly at rest", () => {
    expect(run(restingMotion(), 5, false).state).toEqual(restingMotion());
  });

  test("starting eases in: the first frames barely move and color arrives with speed", () => {
    const { state, turns } = run(restingMotion(), 0.2, true);
    expect(turns.at(-1)!).toBeLessThan(0.01);
    expect(state.color).toBeGreaterThan(0);
    expect(state.color).toBeLessThan(1);
  });

  test("stopping finishes the turn and lands on the rest view with no color", () => {
    const working = run(restingMotion(), 7.3, true).state;
    expect(working.color).toBe(1);

    const { state, turns } = run(working, 20, false);
    expect(state).toEqual(restingMotion());
    const before = turns.slice(0, turns.indexOf(0));
    expect(before.every((turn, index) => index === 0 || turn >= before[index - 1]! - 1e-9)).toBe(
      true,
    );
  });

  test("it never moves backwards or jumps while settling", () => {
    const working = run(restingMotion(), 4.1, true).state;
    let state = working;
    let before = state.turn;

    for (let frame = 0; frame < 2000 && state.mode !== "rest"; frame++) {
      state = stepMotion(state, FRAME, false);

      if (state.mode === "rest") break;

      expect(state.turn - before).toBeGreaterThanOrEqual(-1e-9);
      expect(state.turn - before).toBeLessThan(0.02);
      before = state.turn;
    }

    expect(state.mode).toBe("rest");
  });

  test("a stop asked for while still speeding up waits for the ramp, then settles", () => {
    const early = run(restingMotion(), RAMP_SECONDS / 2, true).state;
    const { state } = run(early, 20, false);
    expect(state).toEqual(restingMotion());
  });

  test("a mark asked to work again while settling finishes settling first", () => {
    const working = run(restingMotion(), 4.1, true).state;
    const settling = stepMotion(working, FRAME, false);
    expect(settling.mode).toBe("settle");
    expect(stepMotion(settling, FRAME, true).mode).toBe("settle");
  });
});
