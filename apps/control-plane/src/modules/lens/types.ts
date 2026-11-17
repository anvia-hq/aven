import type { LensCaptureMode } from "@aven/protocol/lens";

export type LensSettingsView = {
  baseUrl: string;
  publicKey: string;
  keyHint: string;
  captureMode: LensCaptureMode;
};

export type StoredLensSettings = {
  baseUrl: string;
  publicKey: string;
  secretKeyEncrypted: string;
  keyHint: string;
  captureMode: LensCaptureMode;
};
