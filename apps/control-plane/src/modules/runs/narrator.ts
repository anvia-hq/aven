import { extract } from "@anvia/core/extractor";
import { resolveAgentModel } from "@aven/agents/agent-model";
import type { ModelConfig } from "@aven/agents/types";
import type { TimelineIcon, TimelineTone, ToolNarration, ToolPart } from "@aven/protocol/types";
import { z } from "zod";

import { serverModelsService } from "../server-models/service";
import type { RunNarrator } from "./types";

const NARRATOR_TIMEOUT_MS = 6_000;
const CONFIG_CACHE_MS = 30_000;

const NARRATED_TOOLS = new Set([
  "edit",
  "write_file",
  "apply_patch",
  "exec_command",
  "start_process",
  "view_image",
]);

const ICONS = [
  "search",
  "file",
  "code",
  "test",
  "check",
  "warning",
  "error",
  "browser",
  "pr",
  "git",
  "terminal",
  "task",
  "computer",
  "globe",
  "sparkles",
] as const satisfies readonly TimelineIcon[];

const TONES = ["muted", "success", "warning", "error"] as const satisfies readonly TimelineTone[];

const INSTRUCTIONS = `You write ultra-concise activity timeline entries for an AI software engineer.
Given one completed tool call (name, target, diff or output, status), produce:
- label: short present-participle or past phrase (3-7 words, e.g. "Patching dashboard/export.ts", "Reproducing crash in browser", "Running unit tests"). Never include raw shell flags.
- outcome (optional): crisp factual result when meaningful (3-9 words, e.g. "Added null check in PDF renderer", "84/84 passed", "Uncaught TypeError: Cannot read properties of null"). Omit if trivial.
- icon: best semantic icon from the enum.
- tone: "success" for verified wins/passing checks, "error" or "warning" for failures/crashes, "muted" otherwise.
Be factual—never invent counts or claims not in the tool input/output.`;

const schema = z.object({
  label: z.string().trim().min(1).max(72),
  outcome: z.string().trim().min(1).max(96).optional(),
  icon: z.enum(ICONS).optional(),
  tone: z.enum(TONES).optional(),
});

export function shouldNarrate(tool: ToolPart) {
  if (tool.status === "running") return false;

  if (tool.status === "error") return true;

  return NARRATED_TOOLS.has(tool.name);
}

function summarizeForPrompt(tool: ToolPart) {
  const lines = [`tool: ${tool.name}`, `status: ${tool.status}`];

  if (tool.target) lines.push(`target: ${tool.target.slice(0, 300)}`);

  if (tool.diff?.length) {
    const prefix = (type: "add" | "del" | "ctx") => {
      if (type === "add") return "+";

      if (type === "del") return "-";

      return " ";
    };
    const sample = tool.diff
      .slice(0, 24)
      .map((line) => `${prefix(line.type)}${line.text}`)
      .join("\n");
    lines.push(`diff:\n${sample}`);
  } else if (tool.output) {
    lines.push(`output:\n${tool.output.slice(0, 1200)}`);
  }

  return lines.join("\n");
}

export function createRunNarrator(
  resolveConfig: () => Promise<ModelConfig | null> = () => serverModelsService.small(),
  cacheMs = CONFIG_CACHE_MS,
): RunNarrator {
  let cached: { value: ModelConfig | null; expiresAt: number } | undefined;

  async function getConfig() {
    const now = Date.now();

    if (cacheMs > 0 && cached && cached.expiresAt > now) return cached.value;

    const value = await resolveConfig();

    if (cacheMs > 0) cached = { value, expiresAt: now + cacheMs };

    return value;
  }

  return {
    async narrate(tool: ToolPart, signal?: AbortSignal): Promise<ToolNarration | null> {
      if (!shouldNarrate(tool) || signal?.aborted) return null;

      try {
        const config = await getConfig();

        if (!config || signal?.aborted) return null;

        const { model } = resolveAgentModel(config);
        const timeout = AbortSignal.timeout(NARRATOR_TIMEOUT_MS);
        const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const { output } = await extract({
          model,
          text: summarizeForPrompt(tool),
          instructions: INSTRUCTIONS,
          outputSchema: schema,
          retries: false,
          abortSignal,
        });
        const narration: ToolNarration = { toolId: tool.id, label: output.label };

        if (output.outcome) narration.outcome = output.outcome;

        if (output.icon) narration.icon = output.icon;

        if (output.tone) narration.tone = output.tone;

        return narration;
      } catch {
        return null;
      }
    },
  };
}
