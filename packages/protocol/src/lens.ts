export const LENS_CAPTURE_MODES = ["safe", "full"] as const;

export type LensCaptureMode = (typeof LENS_CAPTURE_MODES)[number];
