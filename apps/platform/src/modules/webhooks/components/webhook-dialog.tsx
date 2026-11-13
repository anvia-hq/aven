import { Check, Copy, Plus } from "@mynaui/icons-react";
import { WEBHOOK_NAME_MAX } from "@aven/protocol/webhooks";
import { useState, type FormEvent } from "react";

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
import { TextField } from "@aven/ui/text-field";
import { useClipboard } from "@/hooks/use-clipboard";

import { useWebhooks } from "../hooks/use-webhooks";
import type { WebhookCreated } from "../types";

const addressOf = (created: WebhookCreated) => `${window.location.origin}/api${created.urlPath}`;

function Created({ created, onDone }: { created: WebhookCreated; onDone: () => void }) {
  const { copied, copy } = useClipboard();
  const address = addressOf(created);

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{created.name} is ready</DialogTitle>
        <DialogDescription>
          Paste this address into the service that sends the webhook. It is shown only this once:
          anyone who has it can wake your main bot. If you lose it, remove this webhook and make
          another.
        </DialogDescription>
      </DialogHeader>
      <pre
        aria-label="Webhook address"
        className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap"
      >
        {address}
      </pre>
      <div>
        <Button type="button" variant="outline" onClick={() => void copy(address)}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy address"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A sender that cannot take the token in the URL can post to{" "}
        <span className="font-mono">/api{created.path}</span> with the header{" "}
        <span className="font-mono">x-aven-webhook-token</span> set to{" "}
        <span className="font-mono">{created.token}</span>.
      </p>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}

function WebhookForm({ onCreated }: { onCreated: (created: WebhookCreated) => void }) {
  const { create } = useWebhooks();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const created = await create(String(form.get("name")).trim());

      if (created) onCreated(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New webhook</DialogTitle>
        <DialogDescription>
          Everything that arrives at this address is handed to your main bot. It looks up the
          matching project and decides what to do.
        </DialogDescription>
      </DialogHeader>
      <TextField
        label="Name"
        name="name"
        required
        maxLength={WEBHOOK_NAME_MAX}
        placeholder="GitHub issues"
      />
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          Create webhook
        </Button>
      </DialogFooter>
    </Form>
  );
}

export function WebhookDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<WebhookCreated | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) setCreated(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus /> New webhook
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <Created created={created} onDone={() => handleOpenChange(false)} />
        ) : (
          <WebhookForm onCreated={setCreated} />
        )}
      </DialogContent>
    </Dialog>
  );
}
