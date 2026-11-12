import { LabeledSelect } from "@/components/labeled-select";

import type { ModelsState } from "../types";

type Props = {
  label: string;
  state: ModelsState;
  value: string;
  onChange: (modelId: string) => void;
  waiting: string;
};

export function ModelField({ label, state, value, onChange, waiting }: Props) {
  const { status, models, labels, error } = state;
  let placeholder = waiting;

  if (status === "loading") placeholder = "Loading models…";

  if (status === "error") placeholder = error ?? "Could not load models";

  return (
    <div className="flex flex-col gap-1">
      <LabeledSelect
        label={label}
        options={(models ?? []).map((id) => ({ value: id, label: labels?.[id] ?? id }))}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={models === null || models.length === 0}
      />
      {status === "error" && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
