import type { AnyTool } from "@anvia/core";
import { MIN_REDACTED_LENGTH } from "@aven/protocol/variables";
import type { RunEnvVar } from "@aven/protocol/types";

export { MIN_REDACTED_LENGTH };
export const REDACTED = "[redacted]";

export function secretRedactor(variables: readonly RunEnvVar[] | undefined) {
  const secrets = [
    ...new Set(
      (variables ?? []).flatMap(({ secret, value }) =>
        secret && value.length >= MIN_REDACTED_LENGTH ? [value] : [],
      ),
    ),
  ].sort((a, b) => b.length - a.length);

  if (secrets.length === 0) return undefined;

  const hide = (text: string) =>
    secrets.reduce((hidden, secret) => hidden.replaceAll(secret, REDACTED), text);
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return hide(value);

    if (Array.isArray(value)) return value.map(walk);

    const plain =
      typeof value === "object" &&
      value !== null &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value));

    if (!plain) return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, walk(entry)]),
    );
  };
  return <T>(result: T): T => walk(result) as T;
}

export function redactingTools(tools: readonly AnyTool[], redact: <T>(result: T) => T): AnyTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    requiresApproval: tool.requiresApproval,
    definition: (prompt) => tool.definition(prompt),
    parseInput: tool.parseInput && ((args) => tool.parseInput!(args)),
    call: async (args, context) => redact(await tool.call(args, context)),
  }));
}
