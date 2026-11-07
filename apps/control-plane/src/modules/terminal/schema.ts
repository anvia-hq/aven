import { z } from "zod";

const MAX_COLS = 500;
const MAX_ROWS = 200;

export const terminalSize = z.object({
  cols: z.coerce.number().int().min(1).max(MAX_COLS),
  rows: z.coerce.number().int().min(1).max(MAX_ROWS),
});

export const terminalControl = z.object({
  type: z.literal("resize"),
  cols: terminalSize.shape.cols,
  rows: terminalSize.shape.rows,
});
