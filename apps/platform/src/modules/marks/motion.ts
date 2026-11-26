import type { Motion } from "./types";

export const CYCLE_SECONDS = 3;
export const RAMP_SECONDS = 1.2;

const SPEED = 1 / CYCLE_SECONDS;
const smooth = (amount: number) => {
  const x = Math.min(Math.max(amount, 0), 1);
  return x * x * (3 - 2 * x);
};

export function restingMotion(): Motion {
  return { mode: "rest", turn: 0, color: 0, clock: 0, settle: null };
}

function settling(motion: Motion): Motion {
  let target = Math.ceil(motion.turn - 1e-6);

  if (target - motion.turn < 0.5) target += 1;

  return {
    ...motion,
    mode: "settle",
    settle: {
      from: motion.turn,
      color: motion.color,
      length: (2 * (target - motion.turn)) / SPEED,
      elapsed: 0,
    },
  };
}

export function stepMotion(motion: Motion, seconds: number, working: boolean): Motion {
  if (motion.mode === "rest") {
    return working ? stepMotion({ ...motion, mode: "run", clock: 0 }, seconds, working) : motion;
  }

  if (motion.mode === "run") {
    if (!working && motion.clock >= RAMP_SECONDS) {
      return stepMotion(settling(motion), seconds, working);
    }

    const clock = motion.clock + seconds;
    return {
      ...motion,
      clock,
      turn: motion.turn + Math.min(clock / RAMP_SECONDS, 1) * SPEED * seconds,
      color: smooth(clock / RAMP_SECONDS),
    };
  }

  const { from, color, length, elapsed: before } = motion.settle!;
  const elapsed = before + seconds;

  if (elapsed >= length) return restingMotion();

  return {
    ...motion,
    turn: from + SPEED * elapsed - (SPEED * elapsed * elapsed) / (2 * length),
    color: color * smooth(1 - elapsed / length),
    settle: { from, color, length, elapsed },
  };
}
