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

import { useVariableForm } from "../hooks/use-variable-form";
import { MAX_NAME_LENGTH, MAX_VALUE_LENGTH, NAME_PATTERN, type Variable } from "../types";

type Props = {
  projectId: string;
  /** Given one, the dialog replaces its value; without, it adds a variable. */
  variable?: Variable;
  label: string;
};

export function VariableDialog({ projectId, variable, label }: Props) {
  const [open, setOpen] = useState(false);
  const form = useVariableForm(projectId, variable, () => setOpen(false));
  const editing = variable !== undefined;

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
        <Form ref={form.formRef} onSubmit={form.submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${variable.name}` : "Add a variable"}</DialogTitle>
            <DialogDescription>
              The agent's commands in this project's threads get it in their environment. A secret
              is encrypted and never shown again.
            </DialogDescription>
          </DialogHeader>
          {!editing && (
            <TextField
              label="Name"
              name="name"
              required
              autoComplete="off"
              pattern={NAME_PATTERN}
              maxLength={MAX_NAME_LENGTH}
              placeholder="DATABASE_URL"
            />
          )}
          <TextField
            label="Value"
            name="value"
            type={form.secret ? "password" : "text"}
            autoComplete="off"
            maxLength={MAX_VALUE_LENGTH}
            // A secret is never shown, so a new value must come with every change to one.
            required={form.secret || variable?.secret}
            defaultValue={variable?.value ?? undefined}
            placeholder={editing && variable.secret ? "Enter the value again" : undefined}
          />
          <div className="flex items-center gap-2 text-sm">
            <Switch
              size="sm"
              aria-label="Secret"
              checked={form.secret}
              onCheckedChange={form.setSecret}
            />
            <span>Secret</span>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              {editing ? "Save changes" : "Add variable"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
