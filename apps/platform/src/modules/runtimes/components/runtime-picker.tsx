import { IconDeviceDesktop } from "@tabler/icons-react";

import { CloudLine } from "@/components/cloud-line";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";

import type { RuntimeChoice } from "../types";

type Props = {
  choices: RuntimeChoice[];
  value: string | undefined;
  onChange: (runtimeId: string) => void;
};

const labelOf = ({ runtime, note }: RuntimeChoice) =>
  note === "offline" ? `${runtime.name} (offline)` : runtime.name;

export function RuntimePicker({ choices, value, onChange }: Props) {
  return (
    <Select
      items={choices.map((choice) => ({ value: choice.runtime.id, label: labelOf(choice) }))}
      value={value ?? ""}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger
        aria-label="Computer"
        className="h-7 max-w-48 min-w-0 rounded-full! border-transparent bg-muted/40 px-3 text-[0.8rem] font-medium text-muted-foreground dark:bg-muted/40"
      >
        <SelectValue placeholder="Choose a computer" />
      </SelectTrigger>
      <SelectContent align="start">
        {choices.map((choice) => (
          <SelectItem
            key={choice.runtime.id}
            value={choice.runtime.id}
            disabled={choice.disabled}
            title={choice.note ?? undefined}
          >
            <span className="flex min-w-0 items-center gap-2">
              {choice.runtime.isCloud ? (
                <CloudLine className="text-muted-foreground" />
              ) : (
                <IconDeviceDesktop className="text-muted-foreground" />
              )}
              {labelOf(choice)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
