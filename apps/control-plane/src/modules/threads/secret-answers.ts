import { assertAgentInteractionResponse } from "@anvia/core/agent/interactions";
import { SECRET_TOOL_NAME } from "@aven/protocol/events";

import { describeError, UnprocessableError } from "../../errors";
import { parseSaved } from "../runs/continuation";
import { variableName } from "../variables/schema";
import { variablesService, type Scope } from "../variables/service";

type Answer = { questionId: string; value: string };

type Input = {
  organizationId: string;
  userId: string;
  projectId: string;
  /** The thread's saved continuation, which says what the agent asked. */
  continuation: unknown;
  answers: Answer[];
  /** Whose variable each secret becomes: the project's or the person's own. */
  scope: "project" | "personal";
  /** The person would rather not give them. */
  skip?: boolean;
};

// The answers to the agent's request for a secret (decision 0047) become secret variables, and the
// agent is given a note in their place: the value reaches the model, the run's journal and the
// transcript nowhere. Any other question's answers are returned as they are.
export async function keepSecretAnswers(input: Input): Promise<Answer[]> {
  const { interaction } = parseSaved(input.continuation);
  if (interaction.type !== "tool-question" || interaction.toolName !== SECRET_TOOL_NAME) {
    return input.answers;
  }

  // The answers must be the questions' own before anything is stored, and the runtime that asked
  // is not trusted: each question names a variable the rules allow.
  try {
    assertAgentInteractionResponse(interaction, { type: "tool-question", answers: input.answers });
  } catch (error) {
    throw new UnprocessableError(describeError(error));
  }
  // Declining stores nothing, so it is always allowed: a request for a name that cannot be stored
  // (a reserved one) must not leave the person with no way to answer it.
  if (input.skip) {
    return input.answers.map(({ questionId }) => ({ questionId, value: "not provided" }));
  }
  for (const { id } of interaction.questions) {
    if (!variableName.safeParse(id).success) {
      throw new UnprocessableError(`${id} cannot be a variable name`);
    }
  }

  const scope: Scope =
    input.scope === "personal"
      ? { kind: "personal", organizationId: input.organizationId, userId: input.userId }
      : {
          kind: "project",
          organizationId: input.organizationId,
          projectId: input.projectId,
          actorId: input.userId,
        };
  for (const { questionId, value } of input.answers) {
    // Recorded as the agent's request, so the history says how it came about (decision 0048).
    await variablesService.set(scope, questionId, { value, secret: true }, "agent");
  }
  return input.answers.map(({ questionId }) => ({
    questionId,
    value: `stored as ${questionId}`,
  }));
}
