/** An environment variable of a project, given to the agent's commands (decision 0045). */
export type Variable = {
  name: string;
  secret: boolean;
  /** A plain variable's value; null for a secret, which the API never returns. */
  value: string | null;
  /** The end of a long secret, safe to show; null for a short one or a plain variable. */
  valueHint: string | null;
  updatedAt: string;
};

/** Whose variables a list is (decision 0046): the workspace's, one project's, or the person's own. */
export type VariableScope =
  | { kind: "workspace" }
  | { kind: "project"; projectId: string }
  | { kind: "personal" };

/** The API path of a scope's variables. */
export function variablesPath(scope: VariableScope) {
  if (scope.kind === "project") return `/projects/${scope.projectId}/variables`;
  return `/variables/${scope.kind}`;
}

export type VariableInput = { name: string; value: string; secret: boolean };

// The control plane's rules for a variable (modules/variables/schema.ts), checked here first to say
// so sooner.
export const NAME_PATTERN = "[A-Za-z_][A-Za-z0-9_]*";
export const MAX_NAME_LENGTH = 128;
export const MAX_VALUE_LENGTH = 8192;
export const MAX_VARIABLES = 100;
// A secret at least this long is hidden from the output of the agent's commands; a shorter one is
// not (runtime-client/src/secret-redaction.ts).
export const MIN_REDACTED_LENGTH = 8;

// Names the runner or the sandbox rely on, which a variable cannot take.
const RESERVED = /^(PATH|HOME|USER|SHELL|PWD|LD_.*|AVEN_.*|GH_.*|GITHUB_.*|GIT_.*)$/i;

export const isReservedName = (name: string) => RESERVED.test(name);
