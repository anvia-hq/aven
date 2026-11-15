import { Plus } from "@mynaui/icons-react";
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
import { LabeledSelect } from "@aven/ui/labeled-select";
import { TextField } from "@aven/ui/text-field";
import type { BoatMachineType } from "@aven/protocol/types";

import { RuntimeCommand } from "./runtime-command";
import { useRuntimes } from "../hooks/use-runtimes";
import type { CreatedRuntime } from "../types";

const KINDS = [
  { value: "manual", label: "A computer I install" },
  { value: "boat", label: "boat.dev sandbox" },
];

const SIZES = [
  { value: "small", label: "Small · 2 vCPU, 4 GB" },
  { value: "default", label: "Default · 4 vCPU, 8 GB" },
  { value: "large", label: "Large · 8 vCPU, 16 GB" },
  { value: "xlarge", label: "X-Large · 16 vCPU, 32 GB" },
];

function Started({ created, onDone }: { created: CreatedRuntime; onDone: () => void }) {
  if (created.runtime.provider === "boat")
    return (
      <div className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{created.runtime.name} is saved</DialogTitle>
          <DialogDescription>
            The API key stays encrypted on this server. The sandbox starts the first time a thread
            needs it, and it has to reach this server. A paid sandbox keeps running, and billing,
            until you revoke the runtime. A free trial stops after two hours and the next thread
            starts it again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Start {created.runtime.name}</DialogTitle>
        <DialogDescription>
          Run this on the machine you want to use (macOS or Linux). It installs what is missing and
          keeps the runner running as a service. The token is shown once; if you lose it, revoke the
          runtime and add a new one.
        </DialogDescription>
      </DialogHeader>
      <RuntimeCommand token={created.token} />
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

function pageIsLocal() {
  if (typeof window === "undefined") return false;

  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

export function NewRuntimeDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"manual" | "boat">("manual");
  const [apiKey, setApiKey] = useState("");
  const [machineType, setMachineType] = useState<BoatMachineType>("default");
  const [created, setCreated] = useState<CreatedRuntime | null>(null);
  const { create } = useRuntimes();
  const boat = kind === "boat";
  const keyReady = /^(boat_|box_)/.test(apiKey.trim());

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (!next) {
      setName("");
      setKind("manual");
      setApiKey("");
      setMachineType("default");
      setCreated(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setCreated(
      await create(
        boat
          ? { name: name.trim(), provider: "boat", apiKey: apiKey.trim(), machineType }
          : { name: name.trim() },
      ),
    );
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus /> Add runtime
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <Started created={created} onDone={() => handleOpenChange(false)} />
        ) : (
          <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Add runtime</DialogTitle>
              <DialogDescription>
                A runtime is a machine that runs agents for this workspace. Everyone in the
                workspace can run threads on it, and those commands run as the user who starts it.
              </DialogDescription>
            </DialogHeader>
            <LabeledSelect
              label="Kind"
              options={KINDS}
              value={kind}
              onChange={(next) => setKind(next === "boat" ? "boat" : "manual")}
            />
            <TextField
              label="Name"
              required
              placeholder={boat ? "cloud" : "my-laptop"}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {boat && (
              <>
                <TextField
                  label="boat.dev API key"
                  type="password"
                  autoComplete="off"
                  required
                  placeholder="boat_…"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
                <LabeledSelect
                  label="Size"
                  options={SIZES}
                  value={machineType}
                  onChange={(next) => setMachineType(next as BoatMachineType)}
                />
                <p className="text-sm text-muted-foreground">
                  A trial account can start Small and Default, and stops the sandbox after two
                  hours. Larger sizes need a paid plan. The key needs permission to create and drive
                  sandboxes.
                </p>
                {pageIsLocal() && (
                  <p className="text-sm text-muted-foreground">
                    This page is on a private address. A sandbox cannot reach it. Set
                    AVEN_BOAT_RUNNER_URL on the server to a public https address ending in /api
                    before a thread uses this runtime.
                  </p>
                )}
              </>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting || !name.trim() || (boat && !keyReady)}>
                Add runtime
              </Button>
            </DialogFooter>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
