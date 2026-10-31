import type { DesktopStatus } from "./types";

/** What a panel on the thread's sandbox shows: its own content (`ready`) once the sandbox runs. */
type SandboxView = "loading" | "problem" | "no-sandbox" | "ready";

export function sandboxView(status: DesktopStatus | null, problem: string | null): SandboxView {
  if (problem) return "problem";
  if (!status) return "loading";
  return status.available ? "ready" : "no-sandbox";
}
