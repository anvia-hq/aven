import { extract } from "@anvia/core/extractor";
import { resolveAgentModel } from "@aven/agents/agent-model";
import { z } from "zod";

import { preferencesService } from "../preferences/service";
import { followUpModel } from "./model";

export const FOLLOW_UP_COUNT = 3;
export const FOLLOW_UP_TIMEOUT_MS = 12_000;
export const FOLLOW_UP_MAX_CHARACTERS = 90;

const INSTRUCTIONS = `You suggest what a person could say next to an AI coding agent. Read the end of the conversation and write ${FOLLOW_UP_COUNT} different replies the user is likely to send, each a short imperative or question in the user's own voice, at most 12 words, with no quotes or numbering. Make each one a real next step that follows from what the agent just said (accept its proposal, pick one of its options, ask for the missing piece, or ask it to verify or explain). Never suggest merging, creating, opening or shipping a pull request: the Ship button does that. Never repeat what the user already asked. If the agent asked a question, the replies answer it.`;

const output = z.object({
  suggestions: z
    .array(z.string().trim().min(1).max(FOLLOW_UP_MAX_CHARACTERS))
    .min(1)
    .max(FOLLOW_UP_COUNT),
});

export const clean = (suggestions: readonly string[]) => [
  ...new Set(
    suggestions.flatMap((text) => {
      const trimmed = text.trim();
      return trimmed ? [trimmed] : [];
    }),
  ),
];

export async function suggestFollowUps(userId: string, transcript: string) {
  const settings = await preferencesService.followUps(userId);

  if (!settings.enabled) return [];

  try {
    const config = await followUpModel(userId, settings);

    if (!config) return [];

    const { model } = resolveAgentModel(config);
    const { output: result } = await extract({
      model,
      text: transcript,
      instructions: INSTRUCTIONS,
      outputSchema: output,
      retries: false,
      abortSignal: AbortSignal.timeout(FOLLOW_UP_TIMEOUT_MS),
    });
    return clean(result.suggestions).slice(0, FOLLOW_UP_COUNT);
  } catch (error) {
    console.error("The small model could not suggest follow-ups:", error);
    return [];
  }
}
