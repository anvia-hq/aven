import { z } from "zod";

// The size of a terminal in characters. A runner clamps it too; this keeps nonsense off the wire.
const MAX_COLS = 500;
const MAX_ROWS = 200;

export const terminalSize = z.object({
  cols: z.coerce.number().int().min(1).max(MAX_COLS),
  rows: z.coerce.number().int().min(1).max(MAX_ROWS),
});

/** What the browser sends as text on a terminal's socket; its keystrokes are binary. */
export const terminalControl = z.object({
  type: z.literal("resize"),
  cols: terminalSize.shape.cols,
  rows: terminalSize.shape.rows,
});
