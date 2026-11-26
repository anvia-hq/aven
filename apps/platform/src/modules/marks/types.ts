export type MarkInk = readonly [number, number, number];

export type OrbColors = readonly [string, string, string];

export type MarkFrame = {
  size: number;
  ink: MarkInk;
  color: number;
  turn: number;
};

export type MarkPaint = (context: CanvasRenderingContext2D, frame: MarkFrame) => void;

export type Vec3 = readonly [number, number, number];

export type Mat3 = readonly [Vec3, Vec3, Vec3];

export type MotionSettle = {
  from: number;
  color: number;
  length: number;
  elapsed: number;
};

export type Motion = {
  mode: "rest" | "run" | "settle";
  turn: number;
  color: number;
  clock: number;
  settle: MotionSettle | null;
};
