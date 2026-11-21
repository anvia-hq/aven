import { isQuestionTool, type AnyTool } from "@anvia/core/tool";

const RICH_TOOL_OUTPUT = Symbol.for("anvia.tool-output.content");

export function isRichToolOutput(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  return Object.getOwnPropertyDescriptor(value, RICH_TOOL_OUTPUT)?.value === true;
}

function hasToJson(value: object): value is { toJSON: () => unknown } {
  return typeof (value as { toJSON?: unknown }).toJSON === "function";
}

function normalizeJsonValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  if (typeof value === "bigint") return value.toString();

  if (typeof value !== "object") return null;

  if (seen.has(value)) return "[Circular]";

  seen.add(value);
  try {
    if (hasToJson(value)) {
      const serialized = value.toJSON();
      return serialized === undefined ? null : normalizeJsonValue(serialized, seen);
    }

    if (Array.isArray(value)) {
      return value.map((item) => {
        if (item === undefined || typeof item === "function" || typeof item === "symbol") {
          return null;
        }

        return normalizeJsonValue(item, seen);
      });
    }

    const plain: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol") {
        continue;
      }

      plain[key] = normalizeJsonValue(entry, seen);
    }
    return plain;
  } finally {
    seen.delete(value);
  }
}

export function toStrictToolOutput(output: unknown): unknown {
  if (typeof output === "string" || isRichToolOutput(output)) return output;

  if (output === undefined) return null;

  return normalizeJsonValue(output, new WeakSet());
}

export function withStrictToolOutput(tool: AnyTool): AnyTool {
  if (isQuestionTool(tool)) return tool;

  const call: AnyTool["call"] = (args, context) => {
    const result = tool.call(args, context);
    return result instanceof Promise ? result.then(toStrictToolOutput) : toStrictToolOutput(result);
  };

  const wrapped: {
    name: string;
    requiresApproval?: unknown;
    definition: AnyTool["definition"];
    call: AnyTool["call"];
    parseInput?: AnyTool["parseInput"];
  } = {
    name: tool.name,
    definition: (prompt) => tool.definition(prompt),
    call,
  };

  if (tool.requiresApproval !== undefined) wrapped.requiresApproval = tool.requiresApproval;

  if (tool.parseInput) wrapped.parseInput = (args) => tool.parseInput!(args);

  return wrapped;
}
