import { CODEX_MODELS } from "@aven/protocol/codex-login";

import { NativeSelect, NativeSelectOption } from "@/components/native-select";

type Props = {
  modelId?: string;
  onChange: (modelId: string | undefined) => void;
};

export function CodexModelMenu({ modelId, onChange }: Props) {
  return (
    <NativeSelect
      size="sm"
      aria-label="Codex model"
      value={modelId ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <NativeSelectOption value="">Default</NativeSelectOption>
      {CODEX_MODELS.map((model) => (
        <NativeSelectOption key={model.id} value={model.id}>
          {model.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
