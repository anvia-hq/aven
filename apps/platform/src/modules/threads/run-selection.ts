import { CLAUDE_DEFAULT_EFFORT } from "@aven/protocol/claude-models";

import type { ClaudeChoice, RunSelection } from "./types";

export function runSelectionOf(
  claude: ClaudeChoice | null | undefined,
  fallback: RunSelection,
): RunSelection {
  if (!claude) return fallback;

  return { modelId: claude.modelId, reasoningEffort: claude.effort ?? CLAUDE_DEFAULT_EFFORT };
}
