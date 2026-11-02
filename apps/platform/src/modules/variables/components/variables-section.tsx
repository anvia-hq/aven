import { Trash } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { cn } from "cn";

import { Button } from "@/components/button";
import { SectionCard } from "@/components/section-card";

import { useCanChangeVariables } from "../hooks/use-can-change-variables";
import { useVariables } from "../hooks/use-variables";
import { MAX_VARIABLES, type Variable, type VariableScope } from "../types";
import { VariableDialog } from "./variable-dialog";
import { VariableHistoryDialog } from "./variable-history-dialog";

// What a variable shows in place of its value: a plain one's own, a secret only as its end.
const shown = (variable: Variable) =>
  variable.secret ? `••••••${variable.valueHint ?? ""}` : (variable.value ?? "");

function VariableRow({
  scope,
  variable,
  canChange,
}: {
  scope: VariableScope;
  variable: Variable;
  canChange: boolean;
}) {
  const { remove } = useVariables(scope);
  return (
    <li className="flex items-center gap-2 border-b py-2 text-sm">
      <span className="font-mono font-medium">{variable.name}</span>
      {variable.secret && <Badge variant="secondary">Secret</Badge>}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
        {shown(variable)}
      </span>
      {canChange && (
        <>
          <VariableDialog scope={scope} variable={variable} label="Edit" />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${variable.name}`}
            onClick={() => remove(variable)}
          >
            <Trash />
          </Button>
        </>
      )}
    </li>
  );
}

type Props = {
  scope: VariableScope;
  title: string;
  /** What to say when there are none. */
  empty: string;
  /** Drawn as a card with a header bar, as on a project's page, instead of a plain section. */
  framed?: boolean;
};

// One scope's environment variables: a project's, the workspace's or the person's own (decision
// 0046). Changing them is offered only to who may.
export function VariablesSection({ scope, title, empty, framed = false }: Props) {
  const { variables, loaded } = useVariables(scope);
  const canChange = useCanChangeVariables(scope);

  if (!loaded) return null;

  const actions = (
    <>
      <VariableHistoryDialog scope={scope} />
      {canChange && variables.length < MAX_VARIABLES && (
        <VariableDialog scope={scope} label="Add" />
      )}
    </>
  );
  const list =
    variables.length === 0 ? (
      <p className={cn("text-sm text-muted-foreground", framed && "p-4")}>{empty}</p>
    ) : (
      <ul
        className={cn("flex flex-col", framed ? "px-4 [&>li:last-child]:border-b-0" : "border-t")}
      >
        {variables.map((variable) => (
          <VariableRow
            key={variable.name}
            scope={scope}
            variable={variable}
            canChange={canChange}
          />
        ))}
      </ul>
    );

  if (framed) {
    return (
      <SectionCard title={title} actions={actions}>
        {list}
      </SectionCard>
    );
  }
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-muted-foreground">{title}</h2>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
      {list}
    </section>
  );
}
