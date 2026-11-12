import type { ComputerStatus } from "./types";

type ComputerView = "loading" | "problem" | "no-computer" | "ready";

export function computerView(status: ComputerStatus | null, problem: string | null): ComputerView {
  if (problem) return "problem";

  if (!status) return "loading";

  return status.available ? "ready" : "no-computer";
}
