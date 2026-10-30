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
  // Resolves to whether the prompt was taken; the text is only cleared when it was.
  onSubmit: (prompt: string, selection: RunSelection) => boolean | Promise<boolean>;
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
  const [sending, setSending] = useState(false);
  const model = useModelSelection();
  const canSend = value.trim().length > 0 && !disabled && !sending;

  async function submit() {
    if (!canSend) return;
    setSending(true);
    const sent = await onSubmit(value.trim(), model.selection);
    setSending(false);
    if (sent) setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter while composing text with an input method confirms a candidate; it is not a send.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex flex-col rounded-lg border bg-card p-2 focus-within:border-ring">
      <Textarea
        aria-label="Prompt"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-14 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
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
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Kbd>↵</Kbd>
            send
          </span>
          <Button
            size="icon-sm"
            aria-label="Send"
            disabled={!canSend}
            onClick={() => void submit()}
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
