import { Label } from "@aven/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";

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

  const options = (models ?? []).map((id) => ({ value: id, label: labels?.[id] ?? id }));

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select
        items={options}
        value={value}
        disabled={models === null || models.length === 0}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger
          aria-label={label}
          className="h-8 w-full rounded-lg border-input px-2.5 text-sm font-normal"
        >
          <SelectValue className="min-w-0 truncate" placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status === "error" && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
