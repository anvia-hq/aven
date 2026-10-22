import { ArrowUp } from "@mynaui/icons-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Kbd } from "@/components/kbd";
import { Textarea } from "@/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";

import { MODES, type Mode } from "../types";

type Props = {
  onSubmit: (prompt: string, mode: Mode) => void;
  placeholder?: string;
  disabled?: boolean;
  defaultMode?: Mode;
  autoFocus?: boolean;
};

export function PromptInput({
  onSubmit,
  placeholder = "Ask anything about the codebase…",
  disabled,
  defaultMode = "smart",
  autoFocus,
}: Props) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<Mode>(defaultMode);
  const canSend = value.trim().length > 0 && !disabled;

  function submit() {
    if (!canSend) return;
    onSubmit(value.trim(), mode);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="rounded-xl border bg-card p-2 shadow-sm focus-within:border-ring">
      <Textarea
        aria-label="Prompt"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-12 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <ToggleGroup
          aria-label="Mode"
          value={[mode]}
          onValueChange={(next) => next[0] && setMode(next[0] as Mode)}
          size="sm"
          spacing={1}
        >
          {MODES.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value} title={item.description}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Kbd>↵</Kbd> send
          </span>
          <Button size="icon-sm" aria-label="Send" disabled={!canSend} onClick={submit}>
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
