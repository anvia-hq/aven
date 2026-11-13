import { Field } from "@base-ui/react/field";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { NativeSelect, NativeSelectOption } from "@aven/ui/native-select";
import { TextField } from "@aven/ui/text-field";

import type { ServerModel, ServerModelDraft, ServerModelOption } from "../types";

type Props = {
  label: string;
  options: ServerModelOption[];
  current: ServerModel | null;
  modelRequired: boolean;
  onSave: (draft: ServerModelDraft) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
};

export function ServerModelForm({
  label,
  options,
  current,
  modelRequired,
  onSave,
  onRemove,
}: Props) {
  const [kind, setKind] = useState(current?.kind ?? options[0]!.id);
  const [modelId, setModelId] = useState(current?.modelId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const option = options.find((each) => each.id === kind) ?? options[0]!;
  const missing = (!current && apiKey.trim() === "") || (modelRequired && modelId.trim() === "");

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    const done = await action();
    setBusy(false);

    if (done) setApiKey("");
  }

  return (
    <Form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => onSave({ kind, modelId, apiKey }));
      }}
    >
      <Field.Root className="flex flex-col gap-1 text-sm">
        <Field.Label>Provider</Field.Label>
        <NativeSelect
          aria-label={`${label} provider`}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          {options.map((each) => (
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
        <Button type="submit" size="sm" disabled={busy || missing}>
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
