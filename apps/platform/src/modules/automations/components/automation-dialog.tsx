import { AUTOMATION_NAME_MAX, AUTOMATION_PROMPT_MAX } from "@aven/protocol/automations";
import { IconCheck, IconCopy, IconPlus } from "@tabler/icons-react";
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
import { Label } from "@aven/ui/label";
import { LabeledSelect } from "@aven/ui/labeled-select";
import { TextField } from "@aven/ui/text-field";
import { Textarea } from "@aven/ui/textarea";
import { useClipboard } from "@aven/ui/use-clipboard";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useAutomations } from "../hooks/use-automations";
import type { AutomationCreated, AutomationTriggerKind } from "../types";

const TRIGGER_OPTIONS = [
  { value: "webhook", label: "Webhook — trigger on incoming HTTP event" },
  { value: "schedule", label: "Schedule — run on a recurring cron" },
];

function CreatedWebhook({ created, onDone }: { created: AutomationCreated; onDone: () => void }) {
  const { copied, copy } = useClipboard();
  const address = `${window.location.origin}/api${created.webhookUrlPath ?? created.webhookPath ?? ""}`;

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{created.name} is ready</DialogTitle>
        <DialogDescription>
          Send JSON or text events to this URL to automatically spin up an engineering thread. This
          secret URL is shown only once.
        </DialogDescription>
      </DialogHeader>
      <pre
        aria-label="Automation webhook URL"
        className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap"
      >
        {address}
      </pre>
      <div>
        <Button type="button" variant="outline" onClick={() => void copy(address)}>
          {copied ? <IconCheck /> : <IconCopy />} {copied ? "Copied" : "Copy webhook URL"}
        </Button>
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}

function AutomationForm({ onCreated }: { onCreated: (created: AutomationCreated) => void }) {
  const { projects } = useProjects();
  const { runtimes, defaultRunner } = useRuntimes();
  const { create } = useAutomations();
  const [projectId, setProjectId] = useState(() => projects[0]?.id ?? "");
  const [runtimeId, setRuntimeId] = useState("");
  const [triggerKind, setTriggerKind] = useState<AutomationTriggerKind>("webhook");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedProjectId = projectId || projects[0]?.id || "";
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const lockedRuntimeId = selectedProject?.directory ? (selectedProject.runtimeId ?? "") : "";
  const effectiveRuntimeId =
    lockedRuntimeId || runtimeId || selectedProject?.runtimeId || defaultRunner?.id || "";
  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  const runtimeOptions = runtimes.map((runtime) => ({ value: runtime.id, label: runtime.name }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProjectId || !effectiveRuntimeId) return;

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();

    if (!name || !prompt.trim()) return;

    setBusy(true);
    try {
      const created = await create({
        name,
        projectId: selectedProjectId,
        runtimeId: effectiveRuntimeId,
        triggerKind,
        cron: triggerKind === "schedule" ? cron.trim() : undefined,
        prompt: prompt.trim(),
      });

      if (created) onCreated(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New automation</DialogTitle>
        <DialogDescription>
          Connect a webhook or schedule directly to an autonomous coding thread in your project.
        </DialogDescription>
      </DialogHeader>
      <TextField
        label="Name"
        name="name"
        required
        maxLength={AUTOMATION_NAME_MAX}
        placeholder="Triage crash reports"
      />
      <LabeledSelect
        label="Project"
        options={projectOptions}
        value={selectedProjectId}
        onChange={(nextProjectId) => {
          setProjectId(nextProjectId);
          setRuntimeId("");
        }}
        placeholder="Choose a project"
        disabled={projectOptions.length === 0}
      />
      {!lockedRuntimeId && (
        <LabeledSelect
          label="Computer"
          options={runtimeOptions}
          value={effectiveRuntimeId}
          onChange={setRuntimeId}
          placeholder="Choose a computer"
          disabled={runtimeOptions.length === 0}
        />
      )}
      <LabeledSelect
        label="Trigger"
        options={TRIGGER_OPTIONS}
        value={triggerKind}
        onChange={(value) => setTriggerKind(value as AutomationTriggerKind)}
      />
      {triggerKind === "schedule" && (
        <TextField
          label="Cron schedule"
          name="cron"
          required
          value={cron}
          onChange={(event) => setCron(event.target.value)}
          placeholder="0 9 * * 1-5"
        />
      )}
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="automation-prompt">Instructions</Label>
        <Textarea
          id="automation-prompt"
          name="prompt"
          required
          rows={4}
          maxLength={AUTOMATION_PROMPT_MAX}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Reproduce the reported issue, write a fix with tests, and open a PR with proof."
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy || !selectedProjectId || !effectiveRuntimeId}>
          Create automation
        </Button>
      </DialogFooter>
    </Form>
  );
}

export function AutomationDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<AutomationCreated | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) setCreated(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <IconPlus /> New automation
      </DialogTrigger>
      <DialogContent>
        {created?.webhookUrlPath ? (
          <CreatedWebhook created={created} onDone={() => handleOpenChange(false)} />
        ) : (
          <AutomationForm
            onCreated={(result) => {
              if (result.webhookUrlPath) setCreated(result);
              else handleOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
