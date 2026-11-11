import { Cloud } from "@mynaui/icons-react";
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
import { Label } from "@/components/label";
import { RadioGroup, RadioGroupItem } from "@/components/radio-group";
import type { AgentHost } from "@aven/protocol/types";

import { useRuntimes } from "../hooks/use-runtimes";
import type { Runtime } from "../types";

const HOSTS: { value: AgentHost; label: string; detail: string }[] = [
  {
    value: "machine",
    label: "On this machine",
    detail: "The agent runs on the runner. While the machine is offline, its threads cannot run.",
  },
  {
    value: "control_plane",
    label: "On the control plane",
    detail:
      "The agent runs on the control plane and uses this machine only for its commands and files. While the machine is offline, the agent still answers, and a tool that needs the machine says it is offline.",
  },
];

export function AgentHostDialog({ runtime }: { runtime: Runtime }) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<AgentHost>(runtime.agentHost);
  const [working, setWorking] = useState(false);
  const { moveAgent } = useRuntimes();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setHost(runtime.agentHost);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (host === runtime.agentHost) return;
    setWorking(true);
    if (await moveAgent(runtime, host)) setOpen(false);
    setWorking(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Where the agent of ${runtime.name} runs`}
          />
        }
      >
        <Cloud />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <Form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Where the agent runs</DialogTitle>
            <DialogDescription>
              For the threads that start on {runtime.name} from now on. A run that is going keeps
              where it is.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            aria-label="Where the agent runs"
            value={host}
            onValueChange={(value) => setHost(value as AgentHost)}
          >
            {HOSTS.map((option) => (
              <Label
                key={option.value}
                className="cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 font-normal transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-accent"
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.detail}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={working || host === runtime.agentHost}>
              Save
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
