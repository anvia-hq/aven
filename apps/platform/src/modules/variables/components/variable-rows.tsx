import { X } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";

import { PROBLEM_TEXT } from "../rows";
import { MAX_NAME_LENGTH, MAX_VALUE_LENGTH, type EnvIssue, type RowState } from "../types";
import { looksLikeEnv } from "../parse-env";

type Props = {
  states: RowState[];
  issues: EnvIssue[];
  secret: boolean;
  onChange: (id: number, change: { name?: string; value?: string }) => void;
  onRemove: (id: number) => void;
  onAdd: () => void;
  onPaste: (id: number, text: string) => void;
};

export function VariableRows({
  states,
  issues,
  secret,
  onChange,
  onRemove,
  onAdd,
  onPaste,
}: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ul
        aria-label="Variables to add"
        className="-m-1 flex max-h-72 flex-col gap-2 overflow-y-auto p-1"
      >
        {states.map(({ row, problem, skipped }, index) => (
          <li key={row.id} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <Input
                aria-label={`Name ${index + 1}`}
                aria-invalid={problem !== null}
                autoComplete="off"
                spellCheck={false}
                maxLength={MAX_NAME_LENGTH}
                placeholder="DATABASE_URL"
                className="flex-1 font-mono text-xs md:text-xs"
                value={row.name}
                onChange={(event) => onChange(row.id, { name: event.target.value })}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (!looksLikeEnv(text)) return;
                  event.preventDefault();
                  onPaste(row.id, text);
                }}
              />
              <Input
                aria-label={`Value ${index + 1}`}
                type={secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                maxLength={MAX_VALUE_LENGTH}
                placeholder="value"
                className="flex-1 font-mono text-xs md:text-xs"
                value={row.value}
                onChange={(event) => onChange(row.id, { value: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove row ${index + 1}`}
                onClick={() => onRemove(row.id)}
              >
                <X />
              </Button>
            </div>
            {problem && <p className="text-xs text-destructive">{PROBLEM_TEXT[problem]}</p>}
            {!problem && skipped && row.name.trim() !== "" && (
              <p className="text-xs text-muted-foreground">
                A secret needs a value, so this one is not added.
              </p>
            )}
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="self-start text-muted-foreground"
        onClick={onAdd}
      >
        Add another
      </Button>
      {issues.length > 0 && (
        <ul aria-label="Skipped lines" className="flex flex-col gap-0.5 text-xs text-destructive">
          {issues.map((issue) => (
            <li key={`${issue.line}-${issue.text}`}>
              {issue.line > 0 ? `Line ${issue.line}: ` : ""}
              {issue.text && <span className="font-mono">{issue.text}</span>} {issue.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
