import type { BoatMachineType } from "@aven/protocol/types";

export type BoatSandbox = {
  id: string;
  state: string;
  dataExpiredAt: string | null;
};

export type BoatWakeRecord = {
  runtimeId: string;
  apiKey: string;
  runnerToken: string;
  sandboxId: string | null;
  machineType: BoatMachineType;
};

export type BoatClock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};
