import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { LabeledSelect } from "@aven/ui/labeled-select";
import { TextField } from "@aven/ui/text-field";

import { SettingsRow, SettingsSection } from "@/components/settings-section";

import { useCloudSettings } from "../hooks/use-cloud-settings";
import { SANDBOX_PROVIDER_LABELS, SANDBOX_PROVIDERS } from "../types";
import type { CloudSettings, CloudSettingsDraft, SandboxProvider } from "../types";

type FormProps = {
  current: CloudSettings | null;
  onSave: (draft: CloudSettingsDraft) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
};

const PROVIDER_KEY_HINTS: Record<SandboxProvider, string> = {
  spaces: "spk_…",
  boat: "boat_…",
  lizard: "liz_…",
};

const BASE_LABELS: Record<SandboxProvider, { label: string; placeholder: string }> = {
  spaces: { label: "Spaces server", placeholder: "https://spaces.example.com/api/v1" },
  boat: { label: "Boat API address (optional)", placeholder: "https://boat.dev/api/v1" },
  lizard: { label: "Lizard API address (optional)", placeholder: "https://lizard.build" },
};

const OPTIONS = SANDBOX_PROVIDERS.map((value) => ({
  value,
  label: SANDBOX_PROVIDER_LABELS[value],
}));

function SandboxForm({ current, onSave, onRemove }: FormProps) {
  const [provider, setProvider] = useState<SandboxProvider>(current?.provider ?? "spaces");
  const [base, setBase] = useState(current?.base ?? "");
  const [project, setProject] = useState(current?.project ?? "");
  const [runnerUrl, setRunnerUrl] = useState(current?.runnerUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const spaces = provider === "spaces";
  const lizard = provider === "lizard";
  const keptKey = current?.provider === provider;
  const keyPlaceholder =
    keptKey && current
      ? `Saved, ending …${current.keyHint}. Leave empty to keep it`
      : PROVIDER_KEY_HINTS[provider];

  function changeProvider(next: SandboxProvider) {
    if (next === provider) return;

    setProvider(next);
    setApiKey("");

    if (next !== current?.provider) {
      setBase("");
      setProject("");
      setRunnerUrl("");
    } else {
      setBase(current.base ?? "");
      setProject(current.project ?? "");
      setRunnerUrl(current.runnerUrl ?? "");
    }
  }

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
        void run(() => onSave({ provider, base, project, runnerUrl, apiKey }));
      }}
    >
      <LabeledSelect
        label="Sandbox platform"
        options={OPTIONS}
        value={provider}
        onChange={(value) => changeProvider(value as SandboxProvider)}
      />
      <TextField
        label={BASE_LABELS[provider].label}
        value={base}
        placeholder={BASE_LABELS[provider].placeholder}
        onChange={(event) => setBase(event.target.value)}
      />
      {lizard && (
        <TextField
          label="Lizard project (optional if account has one)"
          value={project}
          placeholder="my-project or proj_…"
          onChange={(event) => setProject(event.target.value)}
        />
      )}
      <TextField
        label={spaces ? "Address a sandbox dials (optional)" : "Public address a sandbox dials"}
        value={runnerUrl}
        placeholder={spaces ? "http://192.168.1.10:8000" : "https://aven.example.com/api"}
        onChange={(event) => setRunnerUrl(event.target.value)}
      />
      <TextField
        label="API key"
        type="password"
        autoComplete="off"
        value={apiKey}
        placeholder={keyPlaceholder}
        onChange={(event) => setApiKey(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy || (spaces && base.trim() === "") || (!keptKey && apiKey.trim() === "")}
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
        "Choose one sandbox platform and give its key to offer Aven Cloud as a computer. An installation uses one at a time.",
    };
  }

  return {
    title: SANDBOX_PROVIDER_LABELS[settings.provider],
    description: "Every workspace can start a thread on an Aven Cloud computer.",
  };
}

export function SandboxSection() {
  const { settings, failed, save, remove } = useCloudSettings();

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{failed}</p>;

  const state = summary(settings);

  return (
    <SettingsSection
      title="Aven Cloud sandbox"
      description="Where Aven Cloud computers run: the platform that boots them, and the address a sandbox uses to reach this server."
    >
      <SettingsRow title={`Sandbox platform: ${state.title}`} description={state.description}>
        {settings?.base && <span className="text-xs text-muted-foreground">{settings.base}</span>}
      </SettingsRow>
      <SandboxForm
        key={`sandbox:${settings?.provider}:${settings?.base}:${settings?.project}:${settings?.runnerUrl}:${settings?.keyHint}`}
        current={settings}
        onSave={save}
        onRemove={remove}
      />
    </SettingsSection>
  );
}
