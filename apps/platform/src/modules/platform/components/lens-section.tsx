import { useState } from "react";

import { LENS_CAPTURE_MODES } from "@aven/protocol/lens";
import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { LabeledSelect } from "@aven/ui/labeled-select";
import { TextField } from "@aven/ui/text-field";

import { SettingsRow, SettingsSection } from "@/components/settings-section";

import { useLensSettings } from "../hooks/use-lens-settings";
import { LENS_CAPTURE_MODE_LABELS } from "../types";
import type { LensCaptureMode, LensSettings, LensSettingsDraft } from "../types";

type FormProps = {
  current: LensSettings | null;
  onSave: (draft: LensSettingsDraft) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
};

const CAPTURE_OPTIONS = LENS_CAPTURE_MODES.map((value) => ({
  value,
  label: LENS_CAPTURE_MODE_LABELS[value],
}));

function LensForm({ current, onSave, onRemove }: FormProps) {
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? "");
  const [publicKey, setPublicKey] = useState(current?.publicKey ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [captureMode, setCaptureMode] = useState<LensCaptureMode>(current?.captureMode ?? "safe");
  const [busy, setBusy] = useState(false);
  const secretPlaceholder = current
    ? `Saved, ending …${current.keyHint}. Leave empty to keep it`
    : "sk_lens_…";

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    const done = await action();
    setBusy(false);

    if (done) setSecretKey("");
  }

  return (
    <Form
      className="flex max-w-md flex-col gap-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => onSave({ baseUrl, publicKey, secretKey, captureMode }));
      }}
    >
      <TextField
        label="Lens address"
        value={baseUrl}
        placeholder="https://lens.example.com"
        onChange={(event) => setBaseUrl(event.target.value)}
      />
      <TextField
        label="Public key"
        autoComplete="off"
        value={publicKey}
        placeholder="pk_lens_…"
        onChange={(event) => setPublicKey(event.target.value)}
      />
      <TextField
        label="Secret key"
        type="password"
        autoComplete="off"
        value={secretKey}
        placeholder={secretPlaceholder}
        onChange={(event) => setSecretKey(event.target.value)}
      />
      <LabeledSelect
        label="What a trace keeps"
        options={CAPTURE_OPTIONS}
        value={captureMode}
        onChange={(value) => setCaptureMode(value as LensCaptureMode)}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={
            busy ||
            baseUrl.trim() === "" ||
            publicKey.trim() === "" ||
            (!current && secretKey.trim() === "")
          }
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

export function LensSection() {
  const { settings, failed, save, remove } = useLensSettings();

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{failed}</p>;

  return (
    <SettingsSection
      title="Anvia Lens"
      description="Where the native agent's runs are traced: every model call and tool result of a run, for evaluations. The Claude and Codex agents are not traced."
    >
      <SettingsRow
        title={settings ? "Traced" : "Not set"}
        description={
          settings
            ? `A trace keeps ${LENS_CAPTURE_MODE_LABELS[settings.captureMode].toLowerCase()}.`
            : "Give this server's Lens address and keys to trace the native agent's runs."
        }
      >
        {settings && <span className="text-xs text-muted-foreground">{settings.baseUrl}</span>}
      </SettingsRow>
      <LensForm
        key={`lens:${settings?.baseUrl}:${settings?.publicKey}:${settings?.keyHint}:${settings?.captureMode}`}
        current={settings}
        onSave={save}
        onRemove={remove}
      />
    </SettingsSection>
  );
}
