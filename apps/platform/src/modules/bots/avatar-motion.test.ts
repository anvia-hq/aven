import { describe, expect, test } from "bun:test";

import {
  advanceMotion,
  createMotion,
  HOP_SECONDS,
  hopPose,
  LANDING,
  REST_POSE,
} from "./avatar-motion";
import type { MotionInput } from "./types";

const calm = () => 0;
const idle: MotionInput = { mood: "idle", pointer: null, reduced: false };
const working: MotionInput = { mood: "working", pointer: null, reduced: false };

function run(motion: ReturnType<typeof createMotion>, input: MotionInput, seconds: number) {
  const poses = [];
  let time = 0;

  while (time < seconds) {
    time += 1 / 60;
    poses.push(advanceMotion(motion, input, 1 / 60, time));
  }

  return poses;
}

describe("a hop", () => {
  test("starts and ends on the ground at its normal size", () => {
    for (const edge of [hopPose(0), hopPose(0.999999)]) {
      expect(edge.lift).toBeCloseTo(0, 3);
      expect(edge.width).toBeCloseTo(1, 3);
      expect(edge.height).toBeCloseTo(1, 3);
    }
  });

  test("crouches before it leaves, stretches in the air and squashes when it lands", () => {
    expect(hopPose(0.18).height).toBeLessThan(0.9);
    expect(hopPose(0.3).height).toBeGreaterThan(1.1);
    expect(hopPose(0.5).lift).toBeGreaterThan(0.9);
    expect(hopPose(0.8).height).toBeLessThan(0.85);
    expect(hopPose(0.8).width).toBeGreaterThan(1.1);
  });

  test("moves smoothly: no frame jumps more than a hand's width", () => {
    let previous = hopPose(0);

    for (let step = 1; step <= 1000; step++) {
      const next = hopPose(step / 1000);
      expect(Math.abs(next.lift - previous.lift)).toBeLessThan(0.02);
      expect(Math.abs(next.height - previous.height)).toBeLessThan(0.02);
      previous = next;
    }
  });
});

describe("an avatar's motion", () => {
  test("idle, it sways side to side unless it is steady, when it keeps facing front", () => {
    const sway = (input: MotionInput) =>
      Math.max(...run(createMotion(1, calm), input, 12).map((pose) => Math.abs(pose.rotY)));
    expect(sway(idle)).toBeGreaterThan(0.05);
    expect(sway({ ...idle, steady: true })).toBeLessThan(0.001);
  });

  test("at rest it floats a little and never hops", () => {
    const poses = run(createMotion(1, calm), idle, 6);
    expect(Math.max(...poses.map((pose) => pose.lift))).toBeLessThan(0.2);
    expect(Math.min(...poses.map((pose) => pose.scaleY))).toBeGreaterThan(0.95);
  });

  test("at work it hops, landing about once a hop", () => {
    const poses = run(createMotion(1, calm), working, HOP_SECONDS * 3 + 0.5);
    expect(Math.max(...poses.map((pose) => pose.lift))).toBeGreaterThan(0.8);
    expect(Math.min(...poses.map((pose) => pose.scaleY))).toBeLessThan(0.85);
    expect(Math.max(...poses.map((pose) => pose.wobble))).toBeGreaterThan(0.5);
    expect(LANDING).toBeLessThan(1);
  });

  test("a bot that was working finishes its hop and settles instead of stopping in the air", () => {
    const motion = createMotion(1, calm);
    run(motion, working, 1.5);
    const settled = run(motion, idle, 3).at(-1)!;
    expect(settled.lift).toBeLessThan(0.2);
    expect(motion.hopping).toBe(false);
    expect(settled.scaleY).toBeCloseTo(1, 1);
  });

  test("two bots starting to work together do not hop in step", () => {
    const first = createMotion(1, () => 0.1);
    const second = createMotion(2, () => 0.9);
    const a = run(first, working, 0.5);
    const b = run(second, working, 0.5);
    expect(Math.max(...a.map((pose) => pose.lift))).not.toBeCloseTo(
      Math.max(...b.map((pose) => pose.lift)),
      2,
    );
  });

  test("its eyes close for a blink and open again", () => {
    const poses = run(createMotion(1, calm), idle, 8);
    const opens = poses.map((pose) => pose.eyeOpen);
    expect(Math.min(...opens)).toBeLessThan(0.1);
    expect(opens.at(-1)!).toBeGreaterThan(0.7);
  });

  test("its eyes follow the pointer and look about when it works", () => {
    const left = run(createMotion(1, calm), { ...idle, pointer: { x: -1, y: 0 } }, 2).at(-1)!;
    const right = run(createMotion(1, calm), { ...idle, pointer: { x: 1, y: 0 } }, 2).at(-1)!;
    expect(left.gazeX).toBeLessThan(-0.5);
    expect(right.gazeX).toBeGreaterThan(0.5);
    expect(left.rotY).toBeLessThan(right.rotY);

    const gazes = run(createMotion(1, Math.random), working, 4).map((pose) => pose.gazeX);
    expect(Math.max(...gazes) - Math.min(...gazes)).toBeGreaterThan(0.3);
  });

  test("with reduced motion it holds still", () => {
    const motion = createMotion(1, calm);
    expect(advanceMotion(motion, { ...working, reduced: true }, 1 / 60, 3)).toBe(REST_POSE);
    expect(motion.hopping).toBe(false);
  });

  test("its mouth stays closed at rest and opens while working, and different shapes move differently", () => {
    const idleMouth = Math.max(
      ...run(createMotion(1, calm, "circle"), idle, 2).map((p) => p.mouthOpen),
    );
    const workMouth = Math.max(
      ...run(createMotion(1, calm, "circle"), working, 2).map((p) => p.mouthOpen),
    );
    expect(idleMouth).toBeLessThan(0.01);
    expect(workMouth).toBeGreaterThan(0.4);

    const flowerSpin = Math.max(
      ...run(createMotion(1, calm, "flower"), working, 2).map((p) => Math.abs(p.rotZ)),
    );
    const diamondSpin = Math.max(
      ...run(createMotion(1, calm, "diamond"), working, 2).map((p) => Math.abs(p.rotY)),
    );
    expect(flowerSpin).toBeGreaterThan(0.2);
    expect(diamondSpin).toBeGreaterThan(1);
  });
});
