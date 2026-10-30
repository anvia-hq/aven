import { ArrowUp, Plus } from "@mynaui/icons-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Textarea } from "@/components/textarea";

import { useModelSelection } from "../hooks/use-model-selection";
import type { RunSelection } from "../types";
import { ModelMenu } from "./model-menu";

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
      <div className="flex items-center gap-2 pt-2">
        {/* Not wired up yet. */}
        <Button variant="ghost" size="icon-sm" aria-label="Add attachment">
          <Plus />
        </Button>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <ModelMenu model={model} />
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
