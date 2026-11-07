import type { DesktopStatus } from "./types";

type SandboxView = "loading" | "problem" | "no-sandbox" | "ready";

export function sandboxView(status: DesktopStatus | null, problem: string | null): SandboxView {
  if (problem) return "problem";
  if (!status) return "loading";
  return status.available ? "ready" : "no-sandbox";
}
