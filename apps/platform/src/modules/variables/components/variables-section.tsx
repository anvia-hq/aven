import { Trash } from "@mynaui/icons-react";

import { Badge } from "@aven/ui/badge";
import { cn } from "cn";

import { Button } from "@aven/ui/button";
import { SectionCard } from "@/components/section-card";

import { useCanChangeVariables } from "../hooks/use-can-change-variables";
import { useVariables } from "../hooks/use-variables";
import { MAX_VARIABLES, type Variable, type VariableScope } from "../types";
import { VariableDialog } from "./variable-dialog";
import { VariableHistoryDialog } from "./variable-history-dialog";

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
  empty: string;
  framed?: boolean;
};

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
        className={cn(
          "flex flex-col",
          framed ? "px-4 [&>li:last-child]:border-b-0" : "[&>li:last-child]:border-b-0",
        )}
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
    <section aria-label={title} className="flex flex-col gap-4 border-t py-6 md:py-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
      {list}
    </section>
  );
}
