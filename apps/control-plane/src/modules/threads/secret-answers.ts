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
  continuation: unknown;
  answers: Answer[];
  scope: "project" | "personal";
  skip?: boolean;
};

export async function keepSecretAnswers(input: Input): Promise<Answer[]> {
  const { interaction } = parseSaved(input.continuation);
  if (interaction.type !== "tool-question" || interaction.toolName !== SECRET_TOOL_NAME) {
    return input.answers;
  }

  try {
    assertAgentInteractionResponse(interaction, { type: "tool-question", answers: input.answers });
  } catch (error) {
    throw new UnprocessableError(describeError(error));
  }
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
    await variablesService.set(scope, questionId, { value, secret: true }, "agent");
  }
  return input.answers.map(({ questionId }) => ({
    questionId,
    value: `stored as ${questionId}`,
  }));
}
