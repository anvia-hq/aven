import { Field } from "@base-ui/react/field";

import { Textarea } from "@/components/textarea";

import type { ParsedEnv } from "../types";

type Props = {
  value: string;
  parsed: ParsedEnv;
  secret: boolean;
  onChange: (value: string) => void;
};

const shown = (value: string) => (value.length > 40 ? `${value.slice(0, 40)}…` : value);

export function EnvPaste({ value, parsed, secret, onChange }: Props) {
  return (
    <>
      <Field.Root className="flex flex-col gap-1 text-sm">
        <Field.Label>.env contents</Field.Label>
        <Field.Control
          render={
            <Textarea
              autoFocus
              rows={6}
              spellCheck={false}
              autoComplete="off"
              className="max-h-60 field-sizing-fixed overflow-auto font-mono text-xs md:text-xs"
              placeholder={"DATABASE_URL=postgres://localhost/app\nAPI_KEY=sk-123"}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          }
        />
      </Field.Root>
      {parsed.entries.length > 0 && (
        <ul
          aria-label="Variables to add"
          className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border p-2 text-xs"
        >
          {parsed.entries.map((entry) => (
            <li key={entry.name} className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono font-medium">{entry.name}</span>
              <span className="min-w-0 truncate font-mono text-muted-foreground">
                {secret ? "••••••••" : shown(entry.value) || "(empty)"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {parsed.issues.length > 0 && (
        <ul aria-label="Skipped lines" className="flex flex-col gap-0.5 text-xs text-destructive">
          {parsed.issues.map((issue) => (
            <li key={`${issue.line}-${issue.text}`}>
              {issue.line > 0 ? `Line ${issue.line}: ` : ""}
              {issue.text && <span className="font-mono">{issue.text}</span>} {issue.reason}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
