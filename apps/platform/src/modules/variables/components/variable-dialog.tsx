import { useState } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { Form } from "@/components/form";
import { Switch } from "@/components/switch";
import { TextField } from "@/components/text-field";

import { looksLikeEnv } from "../parse-env";
import { useVariableForm } from "../hooks/use-variable-form";
import { EnvPaste } from "./env-paste";
import {
  MAX_NAME_LENGTH,
  MAX_VALUE_LENGTH,
  MIN_REDACTED_LENGTH,
  NAME_PATTERN,
  type Variable,
  type VariableScope,
} from "../types";

type Props = {
  scope: VariableScope;
  variable?: Variable;
  label: string;
};

export function VariableDialog({ scope, variable, label }: Props) {
  const [open, setOpen] = useState(false);
  const form = useVariableForm(scope, variable, () => setOpen(false));
  const editing = variable !== undefined;
  const bulk = form.pasted !== null;
  const count = form.parsed.entries.length;
  let submitLabel = "Add variable";
  if (editing) submitLabel = "Save changes";
  else if (bulk) submitLabel = count === 1 ? "Add 1 variable" : `Add ${count} variables`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="xs" />}>{label}</DialogTrigger>
      <DialogContent>
        <Form ref={form.formRef} onSubmit={form.submit} className="flex min-w-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${variable.name}` : "Add a variable"}</DialogTitle>
            <DialogDescription>
              The agent's commands get it in their environment, in the threads it applies to. A
              secret is encrypted and never shown again.
            </DialogDescription>
          </DialogHeader>
          {bulk && (
            <EnvPaste
              value={form.pasted ?? ""}
              parsed={form.parsed}
              secret={form.secret}
              onChange={form.setPasted}
            />
          )}
          {!editing && !bulk && (
            <TextField
              label="Name"
              onPaste={(event) => {
                const text = event.clipboardData.getData("text");
                if (!looksLikeEnv(text)) return;
                event.preventDefault();
                form.setPasted(text);
              }}
              name="name"
              required
              autoComplete="off"
              pattern={NAME_PATTERN}
              maxLength={MAX_NAME_LENGTH}
              placeholder="DATABASE_URL"
            />
          )}
          {!bulk && (
            <TextField
              label="Value"
              name="value"
              type={form.secret ? "password" : "text"}
              autoComplete="off"
              maxLength={MAX_VALUE_LENGTH}
              required={form.secret || variable?.secret}
              defaultValue={variable?.value ?? undefined}
              placeholder={editing && variable.secret ? "Enter the value again" : undefined}
            />
          )}
          {!editing && !bulk && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="self-start text-muted-foreground"
              onClick={() => form.setPasted("")}
            >
              Paste a .env
            </Button>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Switch
              size="sm"
              aria-label="Secret"
              checked={form.secret}
              onCheckedChange={form.setSecret}
            />
            <span>Secret</span>
          </div>
          {form.secret && (
            <p className="text-xs text-muted-foreground">
              A value of {MIN_REDACTED_LENGTH} characters or more is also hidden from the output of
              the agent's commands. A shorter one is not.
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={form.submitting || (bulk && count === 0)}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
