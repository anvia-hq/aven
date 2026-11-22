import type { AvatarMotion, AvatarPose, HopPose, Keyframe, MotionInput } from "./types";

export const HOP_SECONDS = 1.05;
export const LANDING = 0.76;

const BLINK_SECONDS = 0.16;

const KEYS: readonly Keyframe[] = [
  [0.0, 0.0, 1.0, 1.0],
  [0.18, -0.14, 1.1, 0.84],
  [0.3, 0.3, 0.92, 1.15],
  [0.5, 0.95, 0.98, 1.03],
  [0.7, 0.3, 0.93, 1.12],
  [0.8, -0.13, 1.14, 0.8],
  [0.9, 0.02, 0.97, 1.04],
  [1.0, 0.0, 1.0, 1.0],
];

export const REST_POSE: AvatarPose = {
  lift: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  eyeOpen: 0.9,
  gazeX: 0,
  gazeY: 0,
  wobble: 0,
  mouthOpen: 0,
  accessoryBob: 0,
  accessoryTilt: 0,
};

export const approach = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function before(index: number): Keyframe {
  const last = KEYS.length - 2;
  const key = index > 0 ? KEYS[index - 1]! : KEYS[last]!;
  return index > 0 ? key : [key[0] - 1, key[1], key[2], key[3]];
}

function after(index: number): Keyframe {
  const key = index + 2 < KEYS.length ? KEYS[index + 2]! : KEYS[1]!;
  return index + 2 < KEYS.length ? key : [key[0] + 1, key[1], key[2], key[3]];
}

function hermite(
  from: number,
  to: number,
  slopeFrom: number,
  slopeTo: number,
  u: number,
  span: number,
) {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * from +
    (u3 - 2 * u2 + u) * slopeFrom * span +
    (-2 * u3 + 3 * u2) * to +
    (u3 - u2) * slopeTo * span
  );
}

export function hopPose(phase: number): HopPose {
  const wrapped = clamp(phase, 0, 0.999999);
  let index = 0;

  while (index < KEYS.length - 2 && wrapped >= KEYS[index + 1]![0]) index++;

  const from = KEYS[index]!;
  const to = KEYS[index + 1]!;
  const previous = before(index);
  const next = after(index);
  const span = to[0] - from[0];
  const u = (wrapped - from[0]) / span;
  const channel = (c: 1 | 2 | 3) =>
    hermite(
      from[c],
      to[c],
      (to[c] - previous[c]) / (to[0] - previous[0]),
      (next[c] - from[c]) / (next[0] - from[0]),
      u,
      span,
    );
  return { lift: channel(1), width: channel(2), height: channel(3) };
}

export function createMotion(seed: number, random: () => number, family = "circle"): AvatarMotion {
  return {
    family,
    work: 0,
    phase: 0,
    hopping: false,
    holdFor: 0,
    hopWeight: 0,
    wobble: 0,
    open: 0.82,
    gaze: { x: 0, y: 0 },
    saccade: { x: 0, y: 0 },
    saccadeAt: 0,
    blinkAt: 1 + random() * 3,
    blinkT: -1,
    rotX: 0,
    rotY: 0,
    seed,
    stagger: random() * HOP_SECONDS,
    random,
  };
}

function advanceHop(motion: AvatarMotion, working: boolean, dt: number) {
  if (working && !motion.hopping) {
    motion.hopping = true;
    motion.phase = 0;
    motion.holdFor = motion.stagger;
  }

  if (!motion.hopping) return;

  if (motion.holdFor > 0) {
    motion.holdFor = Math.max(0, motion.holdFor - dt);
    return;
  }

  const previous = motion.phase;
  motion.phase += dt / HOP_SECONDS;

  if (previous < LANDING && motion.phase >= LANDING) motion.wobble = Math.max(motion.wobble, 0.9);

  if (motion.phase < 1) return;

  motion.phase -= 1;

  if (!working) {
    motion.phase = 0;
    motion.hopping = false;
  }
}

function blinkOf(motion: AvatarMotion, dt: number, time: number) {
  if (time > motion.blinkAt && motion.blinkT < 0) motion.blinkT = 0;

  if (motion.blinkT < 0) return 1;

  motion.blinkT += dt;

  const u = motion.blinkT / BLINK_SECONDS;

  if (u >= 1) {
    motion.blinkT = -1;
    motion.blinkAt = time + 2 + motion.random() * 3.2;
    return 1;
  }

  return u < 0.5 ? 1 - u * 2 * 0.96 : 0.04 + (u - 0.5) * 2 * 0.96;
}

type ShapeFlavor = {
  lift: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
};

function flavorOf(
  family: string,
  time: number,
  seed: number,
  phase: number,
  rest: number,
  work: number,
  hopWeight: number,
  steady: boolean,
): ShapeFlavor {
  const sway = steady ? 0 : 1;
  const tau = Math.PI * 2;
  const t = time + seed;

  switch (family) {
    case "flower":
      return {
        lift: (Math.sin(t * 1.9) * 0.5 + 0.5) * 0.08 * rest,
        scaleX: 1 + Math.sin(t * 2.6) * 0.025 * rest + Math.sin(phase * tau * 2) * 0.06 * hopWeight,
        scaleY: 1 + Math.sin(t * 2.6) * 0.025 * rest + Math.sin(phase * tau * 2) * 0.06 * hopWeight,
        scaleZ: 1,
        rotX: 0,
        rotY: 0,
        rotZ: Math.sin(t * 1.5) * 0.14 * rest * sway + Math.sin(phase * tau) * 0.34 * hopWeight,
      };
    case "bean":
      return {
        lift: (Math.sin(t * 1.6) * 0.5 + 0.5) * 0.06 * rest,
        scaleX: 1 + Math.sin(phase * tau * 2) * 0.04 * hopWeight,
        scaleY: 1 - Math.sin(phase * tau * 2) * 0.04 * hopWeight,
        scaleZ: 1,
        rotX: 0,
        rotY: 0,
        rotZ: Math.sin(t * 1.8) * 0.16 * rest * sway + Math.sin(phase * tau * 2) * 0.24 * hopWeight,
      };
    case "stack":
      return {
        lift: 0,
        scaleX: 1 - Math.sin(t * 2.4) * 0.035 * rest,
        scaleY: 1 + Math.sin(t * 2.4) * 0.055 * rest + Math.sin(phase * tau) * 0.14 * hopWeight,
        scaleZ: 1 - Math.sin(t * 2.4) * 0.035 * rest,
        rotX: 0,
        rotY: 0,
        rotZ: Math.sin(phase * tau) * 0.06 * hopWeight,
      };
    case "crown":
      return {
        lift: (Math.sin(t * 1.4) * 0.5 + 0.5) * 0.12 * rest,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotX: Math.sin(phase * tau * 2) * 0.18 * hopWeight,
        rotY: Math.sin(t * 0.9) * 0.16 * rest * sway,
        rotZ: Math.sin(t * 1.2) * 0.04 * rest * sway,
      };
    case "arch":
      return {
        lift: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotX: Math.sin(phase * tau * 2) * 0.08 * hopWeight,
        rotY: 0,
        rotZ: Math.sin(t * 1.6) * 0.12 * rest * sway + Math.sin(phase * tau * 2) * 0.22 * hopWeight,
      };
    case "hexagon": {
      const tick = Math.floor(phase * 2) + Math.pow(phase * 2 - Math.floor(phase * 2), 3);
      return {
        lift: (Math.sin(t * 1.8) * 0.5 + 0.5) * 0.14 * rest,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotX: Math.sin(t * 1.2) * 0.09 * rest * sway,
        rotY: Math.cos(t * 0.9) * 0.12 * rest * sway,
        rotZ: Math.sin(tick * Math.PI) * 0.28 * hopWeight,
      };
    }
    case "triangle": {
      const cock = Math.max(0, Math.sin(t * 0.9)) ** 3 * 0.2 * rest * sway;
      return {
        lift: Math.sin(phase * tau) * 0.18 * hopWeight,
        scaleX: 1 - Math.sin(phase * tau) * 0.05 * hopWeight,
        scaleY: 1 + Math.sin(phase * tau) * 0.1 * hopWeight,
        scaleZ: 1,
        rotX: -0.1 * hopWeight,
        rotY: 0,
        rotZ: cock + Math.sin(t * 18) * 0.04 * work,
      };
    }
    case "square":
      return {
        lift: (Math.sin(t * 1.3) * 0.5 + 0.5) * 0.05 * rest,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotX: 0,
        rotY: 0,
        rotZ: Math.sin(t * 1.1) * 0.06 * rest * sway + Math.sin(phase * tau) * 0.2 * hopWeight,
      };
    case "quarter":
      return {
        lift: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotX: 0,
        rotY: 0,
        rotZ: Math.sin(t * 2.1) * 0.18 * rest * sway + Math.sin(phase * tau) * 0.3 * hopWeight,
      };
    case "capsule":
      return {
        lift: (Math.sin(t * 2.1) * 0.5 + 0.5) * 0.1 * rest,
        scaleX: 1 + Math.sin(phase * tau * 2) * 0.07 * hopWeight,
        scaleY: 1 - Math.sin(phase * tau * 2) * 0.05 * hopWeight,
        scaleZ: 1,
        rotX: 0,
        rotY: Math.sin(phase * tau * 2) * 0.16 * hopWeight,
        rotZ: Math.sin(t * 1.7) * 0.1 * rest * sway + Math.sin(phase * tau * 2) * 0.16 * hopWeight,
      };
    case "diamond":
      return {
        lift: (Math.sin(t * 1.9) * 0.5 + 0.5) * 0.18 * rest + 0.12 * hopWeight,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotX: Math.sin(t * 1.1) * 0.08 * rest * sway,
        rotY: Math.sin(t * 1.4) * 0.22 * rest * sway + phase * tau * hopWeight,
        rotZ: 0,
      };
    default:
      return {
        lift: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotX: 0,
        rotY: 0,
        rotZ: Math.sin(phase * tau) * 0.05 * hopWeight,
      };
  }
}

export function advanceMotion(
  motion: AvatarMotion,
  input: MotionInput,
  dt: number,
  time: number,
): AvatarPose {
  if (input.reduced) return REST_POSE;

  const working = input.mood === "working";
  motion.work = approach(motion.work, working ? 1 : 0, 6, dt);
  advanceHop(motion, working, dt);

  const hop = hopPose(motion.hopping && motion.holdFor <= 0 ? motion.phase : 0);
  motion.hopWeight = approach(motion.hopWeight, motion.hopping ? 1 : 0, 10, dt);

  const rest = 1 - motion.hopWeight;
  const float = (Math.sin(time * 1.7 + motion.seed) * 0.5 + 0.5) * 0.13 * rest;
  const breathe = Math.sin(time * 2.3 + motion.seed) * 0.016 * rest;

  const sway = input.steady ? 0 : 1;
  const aimX = input.pointer?.x ?? Math.sin(time * 0.6 + motion.seed) * 0.35 * sway;
  const aimY = input.pointer?.y ?? Math.sin(time * 0.43 + motion.seed) * 0.15 * sway;
  const follow = 1 - motion.work * 0.5;
  motion.rotY = approach(motion.rotY, aimX * 0.5 * follow, 5, dt);
  motion.rotX = approach(motion.rotX, aimY * 0.28 * follow, 5, dt);

  if (working && time > motion.saccadeAt) {
    motion.saccade = {
      x: (motion.random() * 2 - 1) * 0.95,
      y: (motion.random() * 2 - 1) * 0.55,
    };
    motion.saccadeAt = time + 0.5 + motion.random() * 0.9;
  }

  const rate = working ? 22 : 9;
  motion.gaze.x = approach(motion.gaze.x, working ? motion.saccade.x : aimX * 0.9, rate, dt);
  motion.gaze.y = approach(motion.gaze.y, working ? motion.saccade.y : -aimY * 0.7, rate, dt);
  motion.open = approach(motion.open, 0.8 + 0.2 * motion.work, 6, dt);
  motion.wobble = approach(motion.wobble, 0, 3.2, dt);

  const flavor = flavorOf(
    motion.family,
    time,
    motion.seed,
    motion.phase,
    rest,
    motion.work,
    motion.hopWeight,
    input.steady === true,
  );
  const chatter = (Math.sin(time * 11 + motion.seed * 3) * 0.5 + 0.5) * 0.75 + 0.15;
  const mouthOpen = chatter * motion.work;
  const accessoryBob = Math.sin(time * 2.4 + motion.seed) * 0.08 + hop.lift * 0.12;
  const accessoryTilt = Math.sin(time * 2.2 + motion.seed) * 0.14 + flavor.rotZ * 0.5;

  return {
    lift: Math.max(0, hop.lift + float + flavor.lift),
    scaleX: hop.width * (1 - breathe * 0.7) * flavor.scaleX,
    scaleY: hop.height * (1 + breathe) * flavor.scaleY,
    scaleZ: hop.width * flavor.scaleZ,
    rotX: motion.rotX + flavor.rotX,
    rotY: motion.rotY + flavor.rotY,
    rotZ: flavor.rotZ,
    eyeOpen: motion.open * blinkOf(motion, dt, time),
    gazeX: motion.gaze.x,
    gazeY: motion.gaze.y,
    wobble: motion.wobble,
    mouthOpen,
    accessoryBob,
    accessoryTilt,
  };
}
