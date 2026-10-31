import { Trash } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";

import { useVariables } from "../hooks/use-variables";
import { MAX_VARIABLES, type Variable } from "../types";
import { VariableDialog } from "./variable-dialog";

// What a variable shows in place of its value: a plain one's own, a secret only as its end.
const shown = (variable: Variable) =>
  variable.secret ? `••••••${variable.valueHint ?? ""}` : (variable.value ?? "");

function VariableRow({ projectId, variable }: { projectId: string; variable: Variable }) {
  const { remove } = useVariables(projectId);
  return (
    <li className="flex items-center gap-2 border-b py-2 text-sm">
      <span className="font-mono font-medium">{variable.name}</span>
      {variable.secret && <Badge variant="secondary">Secret</Badge>}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
        {shown(variable)}
      </span>
      <VariableDialog projectId={projectId} variable={variable} label="Edit" />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${variable.name}`}
        onClick={() => remove(variable)}
      >
        <Trash />
      </Button>
    </li>
  );
}

// A project's environment variables, which the agent's commands get in its threads' sandboxes.
export function VariablesSection({ projectId }: { projectId: string }) {
  const { variables, loaded } = useVariables(projectId);

  if (!loaded) return null;

  return (
    <section aria-label="Environment variables" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-muted-foreground">Environment variables</h2>
        {variables.length < MAX_VARIABLES && <VariableDialog projectId={projectId} label="Add" />}
      </div>
      {variables.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None yet. Add what the project needs to run, such as a database URL or an API key.
        </p>
      ) : (
        <ul className="flex flex-col border-t">
          {variables.map((variable) => (
            <VariableRow key={variable.name} projectId={projectId} variable={variable} />
          ))}
        </ul>
      )}
    </section>
  );
}
