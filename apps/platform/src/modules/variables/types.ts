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

export type ParsedEntry = { name: string; value: string };
export type EnvIssue = { line: number; text: string; reason: string };
export type ParsedEnv = { entries: ParsedEntry[]; issues: EnvIssue[] };

export type VariableRow = { id: number; name: string; value: string };
export type RowProblem = "name" | "reserved" | "duplicate" | "long";
export type RowState = { row: VariableRow; problem: RowProblem | null; skipped: boolean };
