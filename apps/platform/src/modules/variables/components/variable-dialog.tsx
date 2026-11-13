import { useState } from "react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aven/ui/dialog";
import { Form } from "@aven/ui/form";
import { Switch } from "@aven/ui/switch";
import { TextField } from "@aven/ui/text-field";

import { useVariableForm } from "../hooks/use-variable-form";
import { VariableRows } from "./variable-rows";
import { MAX_VALUE_LENGTH, MIN_REDACTED_LENGTH, type Variable, type VariableScope } from "../types";

type Props = {
  scope: VariableScope;
  variable?: Variable;
  label: string;
};

export function VariableDialog({ scope, variable, label }: Props) {
  const [open, setOpen] = useState(false);
  const form = useVariableForm(scope, variable, () => setOpen(false));
  const editing = variable !== undefined;
  const bulk = form.rows !== null;
  const count = form.count;
  let submitLabel = "Add variable";

  if (editing) submitLabel = "Save changes";
  else if (count > 1) submitLabel = `Add ${count} variables`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) form.reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="xs" />}>{label}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <Form ref={form.formRef} onSubmit={form.submit} className="flex min-w-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${variable.name}` : "Add a variable"}</DialogTitle>
            <DialogDescription>
              The agent's commands get it in their environment, in the threads it applies to. A
              secret is encrypted and never shown again.
            </DialogDescription>
          </DialogHeader>
          {bulk && (
            <VariableRows
              states={form.states}
              issues={form.issues}
              secret={form.secret}
              onChange={form.changeRow}
              onRemove={form.removeRow}
              onAdd={form.addRow}
              onPaste={form.pasteIntoRow}
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
            <Button type="submit" disabled={form.submitting || (bulk && !form.savable)}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
