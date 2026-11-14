import { Field } from "@base-ui/react/field";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form as DecisionForm } from "@aven/ui/form";
import { NativeSelect, NativeSelectOption } from "@aven/ui/native-select";
import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { TextField } from "@aven/ui/text-field";

import { useCanChangeDecisionModel } from "../hooks/use-can-change-decision-model";
import { useDecisionModel } from "../hooks/use-decision-model";
import { DECISION_KINDS } from "../kinds";
import type { DecisionKind, DecisionModel } from "../types";

function titleOf(model: DecisionModel | null) {
  if (!model) return "Not set";

  return model.source === "server" ? "Provided by this server" : "Set";
}

function explanation(model: DecisionModel | null, canChange: boolean) {
  if (model?.source === "server") {
    return canChange
      ? "Multiplayer threads use it. Set one of your own to use your key instead."
      : "Multiplayer threads use it.";
  }

  if (model) return "Multiplayer threads use it.";

  const needed = "Needed before anyone can turn multiplayer on.";
  return canChange
    ? `${needed} Without it a message that mentions a teammate is judged by its words alone.`
    : `${needed} Ask an owner or an admin to set it.`;
}

function Form({
  current,
  onSave,
  onRemove,
}: {
  current: DecisionModel | null;
  onSave: (draft: { kind: DecisionKind; modelId: string; apiKey: string }) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [kind, setKind] = useState<DecisionKind>(current?.kind ?? "jev-openrouter");
  const [modelId, setModelId] = useState(current?.modelId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const option = DECISION_KINDS.find((each) => each.id === kind) ?? DECISION_KINDS[0]!;

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    const done = await action();
    setBusy(false);

    if (done) setApiKey("");
  }

  return (
    <DecisionForm
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => onSave({ kind, modelId, apiKey }));
      }}
    >
      <Field.Root className="flex flex-col gap-1 text-sm">
        <Field.Label>Provider</Field.Label>
        <NativeSelect
          aria-label="Decision model provider"
          value={kind}
          onChange={(event) => setKind(event.target.value as DecisionKind)}
        >
          {DECISION_KINDS.map((each) => (
            <NativeSelectOption key={each.id} value={each.id}>
              {each.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field.Root>
      <TextField
        label="Model"
        value={modelId}
        placeholder={option.defaultModel}
        onChange={(event) => setModelId(event.target.value)}
      />
      <TextField
        label={option.keyLabel}
        type="password"
        autoComplete="off"
        value={apiKey}
        placeholder={current ? `Saved, ending …${current.keyHint}. Leave empty to keep it` : ""}
        onChange={(event) => setApiKey(event.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || (!current && apiKey.trim() === "")}>
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
    </DecisionForm>
  );
}

export function DecisionModelSection() {
  const { decisionModel, loaded, failed, save, remove } = useDecisionModel();
  const canChange = useCanChangeDecisionModel();
  const own = decisionModel?.source === "workspace" ? decisionModel : null;

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{failed}</p>;

  if (!loaded) return null;

  return (
    <SettingsSection
      title="Decision model"
      description="Reads each message in a multiplayer thread and decides whether it is for the agent or for a teammate."
    >
      <SettingsRow
        title={titleOf(decisionModel)}
        description={explanation(decisionModel, canChange)}
      >
        {decisionModel && !canChange && (
          <span className="text-xs text-muted-foreground">
            {DECISION_KINDS.find((each) => each.id === decisionModel.kind)?.label} ·{" "}
            {decisionModel.modelId}
          </span>
        )}
      </SettingsRow>
      {canChange && (
        <div className="pt-4">
          <Form
            key={own ? `${own.kind}:${own.modelId}:${own.keyHint}` : "none"}
            current={own}
            onSave={save}
            onRemove={remove}
          />
        </div>
      )}
    </SettingsSection>
  );
}
