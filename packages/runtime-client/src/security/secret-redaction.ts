import type { AnyTool } from "@anvia/core";
import { codexAuthSecrets, parseCodexAuth } from "@aven/protocol/codex-auth";
import { MIN_REDACTED_LENGTH } from "@aven/protocol/variables";
import type { RunEnvVar, RunSecrets } from "@aven/protocol/types";

import { wrapTools } from "../tools/wrap-tools";

export { MIN_REDACTED_LENGTH };
export const REDACTED = "[redacted]";

export function collectRunSecretVariables(secrets: RunSecrets | undefined): RunEnvVar[] {
  const variables: RunEnvVar[] = [];

  if (secrets?.env) variables.push(...secrets.env);

  if (secrets?.github?.token) {
    variables.push({ name: "GH_TOKEN", value: secrets.github.token, secret: true });
  }

  if (secrets?.gatewayToken) {
    variables.push({ name: "AVEN_GATEWAY_TOKEN", value: secrets.gatewayToken, secret: true });
  }

  if (secrets?.claudeToken) {
    variables.push({ name: "CLAUDE_CODE_OAUTH_TOKEN", value: secrets.claudeToken, secret: true });
  }

  if (secrets?.codexToken) {
    const auth = parseCodexAuth(secrets.codexToken);

    if (auth) {
      codexAuthSecrets(auth).forEach((value, index) =>
        variables.push({ name: `CODEX_AUTH_${index}`, value, secret: true }),
      );
    } else {
      variables.push({ name: "CODEX_API_KEY", value: secrets.codexToken, secret: true });
    }
  }

  return variables;
}

export function runSecretsRedactor(secrets: RunSecrets | undefined) {
  return secretRedactor(collectRunSecretVariables(secrets));
}

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
  return wrapTools(tools, async (tool, args, context) => redact(await tool.call(args, context)));
}
