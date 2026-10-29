import { ArrowUp } from "@mynaui/icons-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Kbd } from "@/components/kbd";
import { Textarea } from "@/components/textarea";

import { useModelSelection } from "../hooks/use-model-selection";
import type { RunSelection } from "../types";
import { EffortSlider } from "./effort-slider";
import { ModelPicker } from "./model-picker";

type Props = {
  onSubmit: (prompt: string, selection: RunSelection) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function PromptInput({
  onSubmit,
  placeholder = "Ask anything about the codebase…",
  disabled,
  autoFocus,
}: Props) {
  const [value, setValue] = useState("");
  const model = useModelSelection();
  const canSend = value.trim().length > 0 && !disabled;

  function submit() {
    if (!canSend) return;
    onSubmit(value.trim(), model.selection);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border bg-card p-4 focus-within:border-ring">
      <Textarea
        aria-label="Prompt"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-20 resize-none border-0 bg-transparent p-1 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-between gap-2 pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <ModelPicker
            providers={model.providers}
            provider={model.provider}
            modelId={model.modelId}
            modelOptions={model.modelOptions}
            loadingModels={model.loadingModels}
            onProvider={model.selectProvider}
            onModel={model.selectModel}
          />
          {model.effort && (
            <EffortSlider
              levels={model.levels}
              value={model.effort}
              onChange={model.selectEffort}
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Kbd>↵</Kbd>
            send
          </span>
          <Button size="icon" aria-label="Send" disabled={!canSend} onClick={submit}>
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
