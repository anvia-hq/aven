import type { DockerLeftovers } from "@aven/protocol/types";

export type RunnerLeftovers = DockerLeftovers & {
  runtimeId: string;
  name: string;
  status: "ok" | "offline" | "unsupported" | "failed";
  error?: string;
};
