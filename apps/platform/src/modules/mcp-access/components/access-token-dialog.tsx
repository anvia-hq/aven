import { Plus } from "@mynaui/icons-react";
import { ACCESS_MAX_NAME } from "@aven/protocol/mcp-access";
import { useState, type FormEvent } from "react";

import { Button } from "@aven/ui/button";
import { Checkbox } from "@aven/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aven/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@aven/ui/field";
import { Form } from "@aven/ui/form";
import { TextField } from "@aven/ui/text-field";

import { useAccessTokens } from "../hooks/use-access-tokens";
import type { AccessPermission, AccessTokenCreated } from "../types";
import { ConnectSnippets } from "./connect-snippets";

export const PERMISSIONS: { id: AccessPermission; label: string; description: string }[] = [
  {
    id: "read",
    label: "Read",
    description: "See threads, projects, runners, bots, memory and the rest.",
  },
  {
    id: "change",
    label: "Change",
    description: "Create and change things, and send agents their tasks.",
  },
  {
    id: "destructive",
    label: "Destructive",
    description: "Delete things and ship pull requests. Hard to undo.",
  },
];

function Created({ created, onDone }: { created: AccessTokenCreated; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{created.name} is ready</DialogTitle>
        <DialogDescription>
          Copy it now: the token is shown only this once. Anyone who has it can do what you allowed
          here, as you.
        </DialogDescription>
      </DialogHeader>
      <ConnectSnippets token={created.token} />
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}

function AccessTokenForm({ onCreated }: { onCreated: (created: AccessTokenCreated) => void }) {
  const { create } = useAccessTokens();
  const [permissions, setPermissions] = useState<AccessPermission[]>(["read", "change"]);
  const [busy, setBusy] = useState(false);

  const toggle = (id: AccessPermission, on: boolean) =>
    setPermissions((held) => (on ? [...held, id] : held.filter((item) => item !== id)));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const created = await create({ name: String(form.get("name")).trim(), permissions });

      if (created) onCreated(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New access token</DialogTitle>
        <DialogDescription>
          Lets another tool or agent use Aven as you, through MCP. Choose what it may do.
        </DialogDescription>
      </DialogHeader>
      <TextField
        label="Name"
        name="name"
        required
        maxLength={ACCESS_MAX_NAME}
        placeholder="Grokbot"
      />
      <Field>
        <FieldLabel>Permissions</FieldLabel>
        <div className="flex flex-col gap-3">
          {PERMISSIONS.map((item) => (
            <Field key={item.id} orientation="horizontal">
              <Checkbox
                id={`permission-${item.id}`}
                aria-label={item.label}
                checked={permissions.includes(item.id)}
                onCheckedChange={(on) => toggle(item.id, on)}
              />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor={`permission-${item.id}`}>{item.label}</FieldLabel>
                <FieldDescription>{item.description}</FieldDescription>
              </div>
            </Field>
          ))}
        </div>
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={busy || permissions.length === 0}>
          Create token
        </Button>
      </DialogFooter>
    </Form>
  );
}

export function AccessTokenDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<AccessTokenCreated | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) setCreated(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus /> New token
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <Created created={created} onDone={() => handleOpenChange(false)} />
        ) : (
          <AccessTokenForm onCreated={setCreated} />
        )}
      </DialogContent>
    </Dialog>
  );
}
