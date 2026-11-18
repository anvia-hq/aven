export type MarkInk = readonly [number, number, number];

export type MarkFrame = {
  size: number;
  ink: MarkInk;
  color: number;
  time: number;
};

export type MarkPaint = (context: CanvasRenderingContext2D, frame: MarkFrame) => void;
