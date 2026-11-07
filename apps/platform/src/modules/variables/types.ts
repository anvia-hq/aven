export type Variable = {
  name: string;
  secret: boolean;
  value: string | null;
  valueHint: string | null;
  updatedAt: string;
};

export type VariableScope =
  | { kind: "workspace" }
  | { kind: "project"; projectId: string }
  | { kind: "personal" };

export function variablesPath(scope: VariableScope) {
  if (scope.kind === "project") return `/projects/${scope.projectId}/variables`;
  return `/variables/${scope.kind}`;
}

export type VariableEvent = {
  id: string;
  name: string;
  action: "created" | "updated" | "removed";
  secret: boolean;
  source: "settings" | "agent";
  createdAt: string;
  actor: string | null;
};

export type VariableInput = { name: string; value: string; secret: boolean };

export const NAME_PATTERN = "[A-Za-z_][A-Za-z0-9_]*";
export const MAX_NAME_LENGTH = 128;
export const MAX_VALUE_LENGTH = 8192;
export const MAX_VARIABLES = 100;
export const MIN_REDACTED_LENGTH = 8;

const RESERVED = /^(PATH|HOME|USER|SHELL|PWD|LD_.*|AVEN_.*|GH_.*|GITHUB_.*|GIT_.*)$/i;

export const isReservedName = (name: string) => RESERVED.test(name);
