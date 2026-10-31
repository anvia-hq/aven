import type { AnyTool } from "@anvia/core";
import type { RunEnvVar } from "@aven/protocol/runtime-wire";

// A secret shorter than this is not hidden: a word that short would be cut out of every sentence of
// output, and is guessable anyway. The settings page says so (decision 0045).
export const MIN_REDACTED_LENGTH = 8;
export const REDACTED = "[redacted]";

/**
 * Hides the values of the run's secrets in what a tool gives back (decision 0045): every string in
 * the result, however deep, with each occurrence of a secret replaced. Only the value as it is: a
 * command that prints it encoded or in pieces is not caught. Undefined without a secret to hide.
 */
export function secretRedactor(variables: readonly RunEnvVar[] | undefined) {
  // Longest first, so a secret that contains another is hidden whole.
  const secrets = [
    ...new Set(
      (variables ?? [])
        .filter(({ secret, value }) => secret && value.length >= MIN_REDACTED_LENGTH)
        .map(({ value }) => value),
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

/** The tools, each giving back its result with the secrets hidden. */
export function redactingTools(tools: readonly AnyTool[], redact: <T>(result: T) => T): AnyTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    requiresApproval: tool.requiresApproval,
    definition: (prompt) => tool.definition(prompt),
    parseInput: tool.parseInput && ((args) => tool.parseInput!(args)),
    call: async (args, context) => redact(await tool.call(args, context)),
  }));
}
