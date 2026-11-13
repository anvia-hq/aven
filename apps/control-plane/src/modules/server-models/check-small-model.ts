import { extract } from "@anvia/core/extractor";
import { resolveAgentModel } from "@aven/agents/agent-model";
import type { ModelConfig } from "@aven/agents/types";
import { z } from "zod";

import { UnprocessableError } from "@aven/server-kit/errors";

export const CHECK_TIMEOUT_MS = 15_000;

export async function checkSmallModel(config: ModelConfig) {
  try {
    const { model } = resolveAgentModel(config);
    await extract({
      model,
      text: "Say ok.",
      instructions: "Answer with the word ok.",
      outputSchema: z.object({ word: z.string() }),
      retries: false,
      abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("The server's small model was refused when saved:", error);
    throw new UnprocessableError(
      "The provider did not accept this key and model. Check both, then save again",
    );
  }
}
