import type { OrbShape } from "../projects/types";

export type ComputerStatus =
  | { available: false }
  | { available: true; state: "asleep" | "waking" | "awake" };

export type Computer = {
  path: string;
  asleep: string;
};

export type BoxAxis = "tumble" | "x" | "y" | "z";

export type Vec3 = readonly [number, number, number];

export type Mat3 = readonly [Vec3, Vec3, Vec3];

export type BoxFrame = { across: number; tilt: Mat3; speed: number };

export type BoxShape = {
  orb: OrbShape;
  start: Mat3;
  phase: Vec3;
  rates: Vec3;
  half: Vec3;
  frames: BoxFrame[];
};
