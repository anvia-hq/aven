import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import { CODEX_CHOICES } from "../codex-models";

type Props = {
  modelId?: string;
  onChange: (modelId: string | undefined) => void;
};

export function CodexModelMenu({ modelId, onChange }: Props) {
  return (
    <Select
      value={modelId ?? "default"}
      onValueChange={(value) => onChange(!value || value === "default" ? undefined : value)}
    >
      <SelectTrigger aria-label="Codex model" className="w-auto min-w-0 bg-muted/50">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CODEX_CHOICES.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
