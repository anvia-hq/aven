import { Check, Copy, Key } from "@mynaui/icons-react";
import { useState, type FormEvent } from "react";

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
import { TextField } from "@/components/text-field";
import { toast } from "@/components/toast";

import { useApiKeys } from "../hooks/use-api-keys";

export function CreateApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { create } = useApiKeys();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSecret(null);
      setCopied(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecret(create(String(new FormData(event.currentTarget).get("name")).trim()));
  }

  async function copy() {
    if (!secret) return;
    await navigator.clipboard?.writeText(secret).catch(() => undefined);
    setCopied(true);
    toast.add({ title: "Copied to clipboard", type: "success" });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Key /> Create key
      </DialogTrigger>
      <DialogContent>
        {secret ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
              <DialogDescription>
                Copy it now. For security, you won't be able to see it again.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
              <code data-testid="new-api-key" className="min-w-0 flex-1 truncate font-mono text-xs">
                {secret}
              </code>
              <Button size="icon-sm" variant="outline" aria-label="Copy key" onClick={copy}>
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>Use keys to authenticate the CLI and CI.</DialogDescription>
            </DialogHeader>
            <TextField label="Name" name="name" required placeholder="e.g. CI" />
            <DialogFooter>
              <Button type="submit">Create key</Button>
            </DialogFooter>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
