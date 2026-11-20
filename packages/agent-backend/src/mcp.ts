import type { AnyTool } from "@anvia/core";
import { createSpawnAgentTool } from "@aven/agents/tools/spawn-agent";
import { createWebSearchTool, WEB_SEARCH_TOOL_NAME } from "@aven/agents/tools/web-search";
import { asRecord, errorMessage } from "@aven/agents/values";
import { QUESTION_TOOL_NAME, SECRET_TOOL_NAME, SPAWN_AGENT_TOOL_NAME } from "@aven/protocol/events";
import type { QuestionPrompt, ToolArtifact } from "@aven/protocol/types";
import { z } from "zod";

import type {
  AvenToolResult,
  BackendImage,
  BackendMcpTool,
  BackendQuestion,
  BackendToolContent,
  BackendToolHost,
} from "./types";

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

async function runTool(tool: AnyTool, input: unknown, host: BackendToolHost) {
  const parsed = tool.parseInput ? tool.parseInput(input as never) : input;
  const output = await tool.call(parsed, { abortSignal: host.signal });
  const artifacts = artifactsOf(output);

  if (artifacts) host.shown?.(artifacts);

  return shown(output);
}

async function runToolResult(
  tool: AnyTool,
  input: unknown,
  host: BackendToolHost,
): Promise<AvenToolResult> {
  try {
    return { text: await runTool(tool, input, host), isError: false };
  } catch (error) {
    return { text: errorMessage(error), isError: true };
  }
}

export async function callAvenToolResult(
  name: string,
  input: unknown,
  host: BackendToolHost,
  options?: { fetch?: typeof fetch },
): Promise<AvenToolResult> {
  try {
    if (host.questions !== false && (name === QUESTION_TOOL_NAME || name === SECRET_TOOL_NAME)) {
      const questions = promptsOf(input);
      const question: BackendQuestion = {
        name: name === SECRET_TOOL_NAME ? "request_secret" : "ask_user",
        questions,
      };

      if (!host.onPark) {
        return {
          text: "The question could not be shown. Ask in your reply instead.",
          isError: true,
        };
      }

      return { text: await host.onPark(question), isError: false };
    }

    if (name === SPAWN_AGENT_TOOL_NAME && host.runSubagent) {
      return {
        text: await runTool(createSpawnAgentTool(host.runSubagent), input, host),
        isError: false,
      };
    }

    if (name === WEB_SEARCH_TOOL_NAME && host.webSearch) {
      return {
        text: await runTool(
          createWebSearchTool({ apiKey: host.webSearch.apiKey, fetch: options?.fetch }),
          input,
          host,
        ),
        isError: false,
      };
    }

    const tool = host.catalog?.find((item) => item.name === name);

    if (tool) return { text: await runTool(tool, input, host), isError: false };

    if (name === "memory") {
      if (!host.memory) return { text: "This run has no memory.", isError: true };

      return { text: shown(await host.memory(input)), isError: false };
    }

    if (name === "cockpit") {
      if (!host.cockpit) return { text: "This run has no cockpit.", isError: true };

      return { text: shown(await host.cockpit(input)), isError: false };
    }

    if (name === "fork") {
      if (!host.fork) return { text: "This run cannot fork.", isError: true };

      const body = asRecord(input);
      const task = typeof body.task === "string" ? body.task : "";
      const context = typeof body.context === "string" ? body.context : "";
      const title = typeof body.title === "string" ? body.title : undefined;
      const started = await host.fork({ task, context, title });
      return { text: `Forked: ${started.title} (${started.id})`, isError: false };
    }

    return { text: `This agent has no tool named ${name}`, isError: true };
  } catch (error) {
    return { text: errorMessage(error), isError: true };
  }
}

export async function callAvenTool(
  name: string,
  input: unknown,
  host: BackendToolHost,
  options?: { fetch?: typeof fetch },
) {
  return (await callAvenToolResult(name, input, host, options)).text;
}

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

function textResult(text: string, isError = false, images: BackendImage[] = []) {
  const result: { content: BackendToolContent[]; isError?: boolean } = {
    content: [
      { type: "text", text },
      ...images.map(({ mediaType, data }) => ({
        type: "image" as const,
        data,
        mimeType: mediaType,
      })),
    ],
  };

  if (isError) result.isError = true;

  return result;
}

export function mcpInputSchema(shape: Record<string, z.ZodType>): Record<string, unknown> {
  if (Object.keys(shape).length === 0) {
    return { type: "object", properties: {}, additionalProperties: true };
  }

  try {
    const schema = {
      ...(z.toJSONSchema(z.object(shape), { unrepresentable: "any" }) as Record<string, unknown>),
    };
    delete schema.$schema;
    schema.additionalProperties = true;
    return schema;
  } catch {
    const properties: Record<string, { description?: string }> = {};
    for (const [key, field] of Object.entries(shape)) {
      properties[key] = field.description ? { description: field.description } : {};
    }
    return { type: "object", properties, additionalProperties: true };
  }
}

async function describeTool(tool: AnyTool): Promise<{
  description: string;
  shape: Record<string, z.ZodType>;
  inputSchema?: Record<string, unknown>;
}> {
  try {
    const definition = await tool.definition("");
    const parameters = asRecord(definition.parameters);
    const properties = asRecord(parameters.properties);
    const shape: Record<string, z.ZodType> = {};
    for (const [key, value] of Object.entries(properties)) {
      const description = asRecord(value).description;
      const field = z.unknown().optional();
      shape[key] = typeof description === "string" ? field.describe(description) : field;
    }

    let inputSchema: Record<string, unknown> | undefined;

    if (parameters.type === "object") {
      const copy = { ...parameters };
      delete copy.$schema;
      inputSchema = copy;
    }

    return { description: definition.description, shape, inputSchema };
  } catch {
    return { description: tool.name, shape: {} };
  }
}

export async function backendMcpTools(
  host: BackendToolHost,
  options?: { fetch?: typeof fetch },
): Promise<BackendMcpTool[]> {
  const wrap = (invoke: (args: unknown) => Promise<AvenToolResult>) => async (args: unknown) => {
    const { text, isError } = await invoke(args);
    const steered = host.steered?.();
    return textResult(steered ? `${text}\n\n${steered.text}` : text, isError, steered?.images);
  };
  const tools: BackendMcpTool[] = [];

  if (host.questions !== false) {
    tools.push({
      name: QUESTION_TOOL_NAME,
      description:
        "Ask the person one or more questions and wait. The run pauses, the question appears as a card, and their answer comes back as this tool's result. Use it only when you cannot go on without their decision.",
      shape: questionShape,
      handler: wrap((args) => callAvenToolResult(QUESTION_TOOL_NAME, args, host)),
    });
    tools.push({
      name: SECRET_TOOL_NAME,
      description:
        "Ask the person for a secret (an API key, a token, a password). The run pauses on a private form. You never see the value: the result says which environment variable now holds it. Each question id is that variable's name, in UPPER_SNAKE_CASE.",
      shape: questionShape,
      handler: wrap((args) => callAvenToolResult(SECRET_TOOL_NAME, args, host)),
    });
  }

  for (const tool of host.catalog ?? []) {
    if (tool.name === SPAWN_AGENT_TOOL_NAME) continue;

    if (tool.name === QUESTION_TOOL_NAME || tool.name === SECRET_TOOL_NAME) continue;

    if (tool.name === WEB_SEARCH_TOOL_NAME && host.webSearch) continue;

    const described = await describeTool(tool);
    tools.push({
      name: tool.name,
      description: described.description,
      shape: described.shape,
      inputSchema: described.inputSchema,
      handler: wrap((args) => runToolResult(tool, args, host)),
    });
  }

  if (host.runSubagent) {
    const spawn = createSpawnAgentTool(host.runSubagent);
    const described = await describeTool(spawn);
    tools.push({
      name: spawn.name,
      description: described.description,
      shape: described.shape,
      inputSchema: described.inputSchema,
      handler: wrap((args) => runToolResult(spawn, args, host)),
    });
  }

  if (host.webSearch) {
    const search = createWebSearchTool({ apiKey: host.webSearch.apiKey, fetch: options?.fetch });
    const described = await describeTool(search);
    tools.push({
      name: search.name,
      description: described.description,
      shape: described.shape,
      inputSchema: described.inputSchema,
      handler: wrap((args) => runToolResult(search, args, host)),
    });
  }

  return tools;
}
