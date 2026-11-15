import { CLAUDE_DEFAULT_EFFORT } from "@aven/protocol/claude-models";

import type { ClaudeChoice, RunSelection } from "./types";

export function runSelectionOf(
  hosted: ClaudeChoice | null | undefined,
  fallback: RunSelection,
  defaultEffort: string = CLAUDE_DEFAULT_EFFORT,
): RunSelection {
  if (!hosted) return fallback;

  return { modelId: hosted.modelId, reasoningEffort: hosted.effort ?? defaultEffort };
}
