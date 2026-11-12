import type { AnyTool } from "@anvia/core";
import { createSpawnAgentTool } from "@aven/agents/tools/spawn-agent";
import { createWebSearchTool } from "@aven/agents/tools/web-search";
import { asRecord, errorMessage } from "@aven/agents/values";
import { QUESTION_TOOL_NAME, SECRET_TOOL_NAME, SPAWN_AGENT_TOOL_NAME } from "@aven/protocol/events";
import type { QuestionPrompt, ToolArtifact } from "@aven/protocol/types";
import { z } from "zod";

import type { ClaudeQuestion, ClaudeToolHost } from "./types";

const choice = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1).optional(),
});

const promptSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  choices: z.array(choice).min(1).optional(),
  allowCustom: z.boolean().optional(),
});

const questionsSchema = z.object({ questions: z.array(promptSchema).min(1).max(4) });

const shown = (value: unknown) => {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

function promptsOf(input: unknown): QuestionPrompt[] {
  const parsed = questionsSchema.parse(input);
  return parsed.questions.map((question) => {
    const prompt: QuestionPrompt = { id: question.id, text: question.text };

    if (question.choices?.length) {
      prompt.choices = question.choices.map((item) => ({
        label: item.label,
        value: item.value ?? item.label,
      }));
    }

    if (question.allowCustom === true) prompt.allowCustom = true;

    return prompt;
  });
}

function artifactsOf(value: unknown): ToolArtifact[] | undefined {
  const artifacts = asRecord(value).artifacts;

  if (!Array.isArray(artifacts)) return undefined;

  const kept: ToolArtifact[] = [];
  for (const entry of artifacts) {
    const artifact = asRecord(entry);

    if (typeof artifact.name !== "string" || typeof artifact.mediaType !== "string") continue;

    const shownArtifact: ToolArtifact = { name: artifact.name, mediaType: artifact.mediaType };

    if (typeof artifact.caption === "string") shownArtifact.caption = artifact.caption;

    kept.push(shownArtifact);
  }
  return kept.length > 0 ? kept : undefined;
}

async function runTool(tool: AnyTool, input: unknown, host: ClaudeToolHost) {
  const parsed = tool.parseInput ? tool.parseInput(input as never) : input;
  const output = await tool.call(parsed, { abortSignal: host.signal });
  const artifacts = artifactsOf(output);

  if (artifacts) host.shown?.(artifacts);

  return shown(output);
}

export async function callAvenTool(name: string, input: unknown, host: ClaudeToolHost) {
  try {
    if (host.questions !== false && (name === QUESTION_TOOL_NAME || name === SECRET_TOOL_NAME)) {
      const questions = promptsOf(input);
      const question: ClaudeQuestion = {
        name: name === SECRET_TOOL_NAME ? "request_secret" : "ask_user",
        questions,
      };

      if (!host.onPark) return "The question could not be shown. Ask in your reply instead.";

      return await host.onPark(question);
    }

    const tool = host.catalog?.find((item) => item.name === name);

    if (tool) return await runTool(tool, input, host);

    if (name === "memory") {
      if (!host.memory) return "This run has no memory.";

      return shown(await host.memory(input));
    }

    if (name === "cockpit") {
      if (!host.cockpit) return "This run has no cockpit.";

      return shown(await host.cockpit(input));
    }

    if (name === "fork") {
      if (!host.fork) return "This run cannot fork.";

      const body = asRecord(input);
      const task = typeof body.task === "string" ? body.task : "";
      const context = typeof body.context === "string" ? body.context : "";
      const title = typeof body.title === "string" ? body.title : undefined;
      const started = await host.fork({ task, context, title });
      return `Forked: ${started.title} (${started.id})`;
    }

    return `This agent has no tool named ${name}`;
  } catch (error) {
    return errorMessage(error);
  }
}

export type ClaudeMcpTool = {
  name: string;
  description: string;
  shape: Record<string, z.ZodType>;
  handler(args: unknown): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
};

const questionShape = {
  questions: z
    .array(
      z.object({
        id: z.string().describe("A short name for the question, such as color."),
        text: z.string().describe("The question, in one sentence."),
        choices: z
          .array(
            z.object({
              label: z.string(),
              value: z.string().optional(),
            }),
          )
          .optional()
          .describe("Two to five choices. Leave out for a free answer."),
        allowCustom: z.boolean().optional(),
      }),
    )
    .describe("The questions to put on the person's screen."),
};

function textResult(text: string, isError = false) {
  const result: { content: { type: "text"; text: string }[]; isError?: boolean } = {
    content: [{ type: "text", text }],
  };

  if (isError) result.isError = true;

  return result;
}

async function describe(tool: AnyTool): Promise<string> {
  try {
    const definition = await tool.definition("");
    return definition.description;
  } catch {
    return tool.name;
  }
}

async function shapeOf(tool: AnyTool): Promise<Record<string, z.ZodType>> {
  try {
    const definition = await tool.definition("");
    const properties = asRecord(asRecord(definition.parameters).properties);
    const shape: Record<string, z.ZodType> = {};
    for (const [key, value] of Object.entries(properties)) {
      const description = asRecord(value).description;
      const field = z.unknown().optional();
      shape[key] = typeof description === "string" ? field.describe(description) : field;
    }
    return shape;
  } catch {
    return {};
  }
}

export async function claudeMcpTools(host: ClaudeToolHost): Promise<ClaudeMcpTool[]> {
  const answer = (name: string) => async (args: unknown) => {
    const text = await callAvenTool(name, args, host);
    const failed = text.startsWith("The ") && text.includes("could not");
    return textResult(text, failed);
  };
  const tools: ClaudeMcpTool[] = [];

  if (host.questions !== false) {
    tools.push({
      name: QUESTION_TOOL_NAME,
      description:
        "Ask the person one or more questions and wait. The run pauses, the question appears as a card, and their answer comes back as this tool's result. Use it only when you cannot go on without their decision.",
      shape: questionShape,
      handler: answer(QUESTION_TOOL_NAME),
    });
    tools.push({
      name: SECRET_TOOL_NAME,
      description:
        "Ask the person for a secret (an API key, a token, a password). The run pauses on a private form. You never see the value: the result says which environment variable now holds it. Each question id is that variable's name, in UPPER_SNAKE_CASE.",
      shape: questionShape,
      handler: answer(SECRET_TOOL_NAME),
    });
  }

  for (const tool of host.catalog ?? []) {
    if (tool.name === SPAWN_AGENT_TOOL_NAME) continue;

    if (tool.name === QUESTION_TOOL_NAME || tool.name === SECRET_TOOL_NAME) continue;

    const description = await describe(tool);
    tools.push({
      name: tool.name,
      description,
      shape: await shapeOf(tool),
      handler: answer(tool.name),
    });
  }

  if (host.runSubagent) {
    const spawn = createSpawnAgentTool(host.runSubagent);
    tools.push({
      name: spawn.name,
      description: await describe(spawn),
      shape: await shapeOf(spawn),
      handler: answer(spawn.name),
    });
  }

  if (host.webSearch) {
    const search = createWebSearchTool({ apiKey: host.webSearch.apiKey });
    tools.push({
      name: search.name,
      description: await describe(search),
      shape: await shapeOf(search),
      handler: answer(search.name),
    });
  }

  return tools;
}
