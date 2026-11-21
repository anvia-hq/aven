import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { TextField } from "@aven/ui/text-field";

import { SettingsSection } from "@aven/ui/settings-section";

import { useCloudLifecycle } from "../hooks/use-cloud-lifecycle";
import type { CloudLifecycle } from "../types";

type FormProps = {
  current: CloudLifecycle;
  onSave: (settings: CloudLifecycle) => Promise<boolean>;
  onReset: () => Promise<boolean>;
};

const minutes = (seconds: number) => String(Math.round((seconds / 60) * 100) / 100);

const optional = (value: number | null) => (value === null ? "" : String(value));

const dollars = (cents: number | null) =>
  cents === null ? "" : String(Math.round((cents / 100) * 100) / 100);

function whole(text: string) {
  const value = Number(text);

  return Number.isInteger(value) && value >= 1 ? value : null;
}

function centsOf(text: string) {
  if (text.trim() === "") return null;

  const value = Math.round(Number(text) * 100);

  return Number.isInteger(value) && value >= 1 ? value : undefined;
}

function LifecycleForm({ current, onSave, onReset }: FormProps) {
  const [agentIdle, setAgentIdle] = useState(minutes(current.agentIdleSeconds));
  const [userIdle, setUserIdle] = useState(minutes(current.userIdleSeconds));
  const [expire, setExpire] = useState(String(current.expireHours));
  const [maxAge, setMaxAge] = useState(String(current.maxAgeHours));
  const [maxRunning, setMaxRunning] = useState(optional(current.maxRunning));
  const [burst, setBurst] = useState(optional(current.startBurst));
  const [every, setEvery] = useState(String(current.startEveryMinutes));
  const [budget, setBudget] = useState(dollars(current.monthlyBudgetCents));
  const [softPercent, setSoftPercent] = useState(String(current.softBudgetPercent));
  const [busy, setBusy] = useState(false);
  const agentSeconds = Math.round(Number(agentIdle) * 60);
  const userSeconds = Math.round(Number(userIdle) * 60);
  const hours = whole(expire);
  const maxAgeHours = whole(maxAge);
  const gap = whole(every);
  const budgetCents = centsOf(budget);
  const softBudgetPercent = whole(softPercent);
  const limitOk = (text: string) => text.trim() === "" || whole(text) !== null;
  const valid =
    agentSeconds >= 1 &&
    userSeconds >= 1 &&
    hours !== null &&
    maxAgeHours !== null &&
    maxAgeHours <= 168 &&
    gap !== null &&
    limitOk(maxRunning) &&
    limitOk(burst) &&
    budgetCents !== undefined &&
    softBudgetPercent !== null &&
    softBudgetPercent <= 99;

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    await action();
    setBusy(false);
  }

  return (
    <Form
      className="flex max-w-md flex-col gap-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();

        if (
          !valid ||
          hours === null ||
          maxAgeHours === null ||
          gap === null ||
          budgetCents === undefined ||
          softBudgetPercent === null
        ) {
          return;
        }

        void run(() =>
          onSave({
            agentIdleSeconds: agentSeconds,
            userIdleSeconds: userSeconds,
            expireHours: hours,
            maxAgeHours,
            maxRunning: whole(maxRunning),
            startBurst: whole(burst),
            startEveryMinutes: gap,
            monthlyBudgetCents: budgetCents,
            softBudgetPercent,
          }),
        );
      }}
    >
      <TextField
        label="Stop a computer after its agent has been idle (minutes)"
        type="number"
        min={0.1}
        step="any"
        value={agentIdle}
        onChange={(event) => setAgentIdle(event.target.value)}
      />
      <TextField
        label="Stop a computer after nobody has used it (minutes)"
        type="number"
        min={0.1}
        step="any"
        value={userIdle}
        onChange={(event) => setUserIdle(event.target.value)}
      />
      <TextField
        label="Hard wall: maximum continuous running time (hours)"
        type="number"
        min={1}
        max={168}
        value={maxAge}
        onChange={(event) => setMaxAge(event.target.value)}
      />
      <TextField
        label="Delete a stopped computer after this many hours"
        type="number"
        min={1}
        value={expire}
        onChange={(event) => setExpire(event.target.value)}
      />
      <TextField
        label="Most computers a workspace may have running at once"
        type="number"
        min={1}
        placeholder="No limit"
        value={maxRunning}
        onChange={(event) => setMaxRunning(event.target.value)}
      />
      <TextField
        label="Computers a person may start in a burst"
        type="number"
        min={1}
        placeholder="No limit"
        value={burst}
        onChange={(event) => setBurst(event.target.value)}
      />
      <TextField
        label="Then one more start every (minutes)"
        type="number"
        min={1}
        value={every}
        onChange={(event) => setEvery(event.target.value)}
      />
      <TextField
        label="Monthly spend brake (USD)"
        type="number"
        min={0.01}
        step="any"
        placeholder="No limit"
        value={budget}
        onChange={(event) => setBudget(event.target.value)}
      />
      <TextField
        label="Soft warning & tightened idle threshold (% of monthly budget)"
        type="number"
        min={1}
        max={99}
        value={softPercent}
        onChange={(event) => setSoftPercent(event.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !valid}>
          Save settings
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void run(onReset)}
        >
          Reset to defaults
        </Button>
      </div>
    </Form>
  );
}

export function CloudLifecycleSection() {
  const { settings, failed, save, reset } = useCloudLifecycle();

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{failed}</p>;

  if (!settings) return null;

  return (
    <SettingsSection
      title="Aven Cloud computers"
      description="When a computer stops and is deleted, hard-wall caps, spend brake, and optional limits on running computers. A stopped computer keeps its disk until deleted; after that, the next call starts a fresh one. Leave a limit empty for none."
    >
      <LifecycleForm
        key={JSON.stringify(settings)}
        current={settings}
        onSave={save}
        onReset={reset}
      />
    </SettingsSection>
  );
}
