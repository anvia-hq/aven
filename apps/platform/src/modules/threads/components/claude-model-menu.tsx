import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import { CLAUDE_MODELS } from "../claude-models";

type Props = {
  modelId?: string;
  onChange: (modelId: string | undefined) => void;
};

export function ClaudeModelMenu({ modelId, onChange }: Props) {
  return (
    <Select
      value={modelId ?? "default"}
      onValueChange={(value) => onChange(!value || value === "default" ? undefined : value)}
    >
      <SelectTrigger aria-label="Claude model" className="w-auto min-w-0 bg-muted/50">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CLAUDE_MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
