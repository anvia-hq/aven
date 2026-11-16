import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { TextField } from "@aven/ui/text-field";

import { SettingsRow, SettingsSection } from "@/components/settings-section";

import { useCloudSettings } from "../hooks/use-cloud-settings";
import type { CloudSettings, CloudSettingsDraft } from "../types";

type FormProps = {
  current: CloudSettings | null;
  onSave: (draft: CloudSettingsDraft) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
};

function CloudForm({ current, onSave, onRemove }: FormProps) {
  const [base, setBase] = useState(current?.base ?? "");
  const [runnerUrl, setRunnerUrl] = useState(current?.runnerUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    const done = await action();
    setBusy(false);

    if (done) setApiKey("");
  }

  return (
    <Form
      className="flex max-w-md flex-col gap-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => onSave({ base, runnerUrl, apiKey }));
      }}
    >
      <TextField
        label="Sandbox server"
        value={base}
        placeholder="https://spaces.example.com/api/v1"
        onChange={(event) => setBase(event.target.value)}
      />
      <TextField
        label="Address a sandbox dials"
        value={runnerUrl}
        placeholder="http://192.168.1.10:8000"
        onChange={(event) => setRunnerUrl(event.target.value)}
      />
      <TextField
        label="API key"
        type="password"
        autoComplete="off"
        value={apiKey}
        placeholder={
          current ? `Saved, ending …${current.keyHint}. Leave empty to keep it` : "spk_…"
        }
        onChange={(event) => setApiKey(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy || base.trim() === "" || runnerUrl.trim() === ""}
        >
          Save
        </Button>
        {current && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void run(onRemove)}
          >
            Remove
          </Button>
        )}
      </div>
    </Form>
  );
}

function summary(settings: CloudSettings | null) {
  if (!settings) {
    return {
      title: "Not set",
      description:
        "Aven Cloud boots a sandbox on a spaces server. Give the server's address and key to offer Aven Cloud as a computer.",
    };
  }

  if (settings.source === "env") {
    return {
      title: "Set in the server's environment",
      description: "Change it where the server is configured. It cannot be edited here.",
    };
  }

  return {
    title: "Set",
    description: "Every workspace can start a thread on an Aven Cloud computer.",
  };
}

export function CloudSection() {
  const { settings, failed, save, remove } = useCloudSettings();

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{failed}</p>;

  const own = settings?.source === "platform" ? settings : null;
  const state = summary(settings);

  return (
    <SettingsSection
      title="Aven Cloud sandbox"
      description="Where Aven Cloud computers run: the spaces server that boots them, and the address a sandbox uses to reach this server."
    >
      <SettingsRow title={`Sandbox server: ${state.title}`} description={state.description}>
        {settings && <span className="text-xs text-muted-foreground">{settings.base}</span>}
      </SettingsRow>
      {settings?.source !== "env" && (
        <CloudForm
          key={`cloud:${own?.base}:${own?.runnerUrl}:${own?.keyHint}`}
          current={own}
          onSave={save}
          onRemove={remove}
        />
      )}
    </SettingsSection>
  );
}
