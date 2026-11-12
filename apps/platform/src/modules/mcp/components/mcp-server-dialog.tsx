import { Plus, Trash } from "@mynaui/icons-react";
import { MCP_MAX_HEADERS, MCP_TARGETS } from "@aven/protocol/mcp";
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
import { Field, FieldDescription, FieldLabel } from "@/components/field";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { Switch } from "@/components/switch";
import { TextField } from "@/components/text-field";

import { useMcpServers } from "../hooks/use-mcp-servers";
import type { McpServer, McpTarget } from "../types";

export const TARGET_LABELS: Record<McpTarget, string> = {
  all: "Bots and threads",
  bots: "Bots only",
  threads: "Threads only",
};

type HeaderRow = {
  key: string;
  name: string;
  value: string;
  saved: boolean;
};

let rowKey = 0;
const blankRow = (): HeaderRow => ({ key: `new-${rowKey++}`, name: "", value: "", saved: false });

function McpServerForm({ server, onDone }: { server?: McpServer; onDone: () => void }) {
  const { create, update } = useMcpServers();
  const [target, setTarget] = useState<McpTarget>(server?.target ?? "all");
  const [allowLocal, setAllowLocal] = useState(server?.allowLocal ?? false);
  const [busy, setBusy] = useState(false);
  const [headers, setHeaders] = useState<HeaderRow[]>(
    (server?.headerNames ?? []).map((name) => ({
      key: `saved-${name}`,
      name,
      value: "",
      saved: true,
    })),
  );

  const setRow = (key: string, changes: Partial<HeaderRow>) =>
    setHeaders((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name")).trim(),
      url: String(form.get("url")).trim(),
      target,
      allowLocal,
      headers: headers
        .filter((row) => row.name.trim() !== "")
        .map((row) => ({
          name: row.name.trim(),
          value: row.saved && row.value === "" ? null : row.value,
        })),
    };
    setBusy(true);
    try {
      const saved = server ? await update(server, input) : await create(input);

      if (saved) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{server ? `Edit ${server.name}` : "Add an MCP server"}</DialogTitle>
        <DialogDescription>
          A remote server your agents call over HTTP. Its tools are named after it.
        </DialogDescription>
      </DialogHeader>
      <TextField
        label="Name"
        name="name"
        required
        defaultValue={server?.name}
        placeholder="Team notes"
        maxLength={40}
      />
      <TextField
        label="URL"
        name="url"
        type="url"
        required
        defaultValue={server?.url}
        placeholder="https://mcp.example.com/mcp"
      />
      <Field>
        <FieldLabel>Used by</FieldLabel>
        <Select value={target} onValueChange={(value) => setTarget(value as McpTarget)}>
          <SelectTrigger aria-label="Used by" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MCP_TARGETS.map((item) => (
              <SelectItem key={item} value={item}>
                {TARGET_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Headers</FieldLabel>
        <FieldDescription>
          Sent with every request, for a token such as Authorization. A value is kept secret: it is
          never shown again.
        </FieldDescription>
        <div className="flex flex-col gap-2">
          {headers.map((row) => (
            <div key={row.key} className="flex gap-2">
              <Input
                aria-label="Header name"
                placeholder="Authorization"
                value={row.name}
                readOnly={row.saved}
                onChange={(event) => setRow(row.key, { name: event.target.value })}
              />
              <Input
                aria-label={`Value of ${row.name || "the header"}`}
                type="password"
                autoComplete="off"
                required={!row.saved}
                placeholder={row.saved ? "Saved: leave blank to keep" : "Bearer …"}
                value={row.value}
                onChange={(event) => setRow(row.key, { value: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${row.name || "header"}`}
                onClick={() => setHeaders((rows) => rows.filter((item) => item.key !== row.key))}
              >
                <Trash />
              </Button>
            </div>
          ))}
          {headers.length < MCP_MAX_HEADERS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setHeaders((rows) => [...rows, blankRow()])}
            >
              <Plus /> Add header
            </Button>
          )}
        </div>
      </Field>
      <Field orientation="horizontal">
        <Switch
          size="sm"
          aria-label="This server is on my own machine or network"
          checked={allowLocal}
          onCheckedChange={setAllowLocal}
        />
        <div className="flex flex-col gap-0.5">
          <FieldLabel>On my own machine or network</FieldLabel>
          <FieldDescription>
            Servers at a local or private address are refused unless you say so. Only turn this on
            for a server you run yourself.
          </FieldDescription>
        </div>
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {server ? "Save changes" : "Add server"}
        </Button>
      </DialogFooter>
    </Form>
  );
}

export function McpServerDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus /> Add server
      </DialogTrigger>
      <DialogContent>
        <McpServerForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function EditMcpServerDialog({
  server,
  open,
  onOpenChange,
}: {
  server: McpServer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <McpServerForm server={server} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
