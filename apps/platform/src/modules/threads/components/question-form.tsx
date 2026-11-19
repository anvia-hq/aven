import { IconArrowLeft, IconArrowRight, IconArrowUp } from "@tabler/icons-react";
import { cn } from "cn";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { Input } from "@aven/ui/input";
import { Label } from "@aven/ui/label";
import { RadioGroup, RadioGroupItem } from "@aven/ui/radio-group";

import { useModelSelection } from "../hooks/use-model-selection";
import type { AgentBackendKind } from "@aven/protocol/types";
import type { Draft, QuestionAnswer, QuestionPrompt, RunSelection, ToolPart } from "../types";

type Props = {
  tool: ToolPart;
  threadId: string;
  backend?: AgentBackendKind;
  onSubmit: (answers: QuestionAnswer[], selection: RunSelection) => boolean | Promise<boolean>;
  onDecline?: (selection: RunSelection) => boolean | Promise<boolean>;
};

export const valueOf = (draft: Draft | undefined) => draft?.custom.trim() || draft?.choice || "";

export function Question({
  prompt,
  draft,
  onChange,
  onChoose,
}: {
  prompt: QuestionPrompt;
  draft: Draft | undefined;
  onChange: (draft: Draft) => void;
  onChoose?: () => void;
}) {
  const current = draft ?? { choice: "", custom: "" };
  const hasChoices = Boolean(prompt.choices?.length);
  const own = prompt.allowCustom || !hasChoices;

  return (
    <div role="group" aria-label={prompt.text} className="flex flex-col gap-3">
      <p className="text-base leading-6 font-medium">{prompt.text}</p>
      {hasChoices && (
        <RadioGroup
          aria-label={prompt.text}
          value={current.custom.trim() ? "" : current.choice}
          onValueChange={(choice) => {
            onChange({ choice: String(choice), custom: "" });
            onChoose?.();
          }}
          className="gap-2"
        >
          {prompt.choices?.map((choice) => (
            <Label
              key={choice.value}
              className="cursor-pointer rounded-2xl border border-transparent bg-muted/40 px-4 py-3 font-normal transition-colors hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-data-checked:border-primary/60 has-data-checked:bg-primary/10"
            >
              <RadioGroupItem value={choice.value} className="absolute size-px opacity-0" />
              {choice.label}
            </Label>
          ))}
        </RadioGroup>
      )}
      {own && (
        <Input
          aria-label={hasChoices ? `${prompt.text} (your own answer)` : prompt.text}
          placeholder={hasChoices ? "Or write your own answer" : "Your answer"}
          value={current.custom}
          onChange={(event) => onChange({ choice: "", custom: event.target.value })}
          className={cn(
            "h-11 rounded-2xl border-transparent bg-muted/40 px-4 py-0 font-normal hover:bg-muted dark:bg-muted/40",
            current.custom.trim() &&
              "border-primary/60 bg-primary/10 hover:bg-primary/10 dark:bg-primary/10",
          )}
        />
      )}
    </div>
  );
}

export function QuestionForm({ tool, threadId, backend, onSubmit, onDecline }: Props) {
  const model = useModelSelection(threadId, backend);
  const prompts = tool.questions ?? [];
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);

  const prompt = prompts[step];
  const last = step === prompts.length - 1;
  const answered = Boolean(prompt && valueOf(drafts[prompt.id]));

  async function submit() {
    if (sending) return;

    setSending(true);
    await onSubmit(
      prompts.map((item) => ({ questionId: item.id, value: valueOf(drafts[item.id]) })),
      model.selection,
    );
    setSending(false);
  }

  async function decline() {
    if (sending) return;

    setSending(true);
    await onDecline?.(model.selection);
    setSending(false);
  }

  if (!prompt) return null;

  return (
    <Form
      aria-label="Answer the agent"
      onFormSubmit={() => (last ? void submit() : answered && setStep(step + 1))}
      className="flex flex-col gap-5 rounded-3xl border border-border/50 bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground/80">
        <span>The agent needs your answer</span>
        {prompts.length > 1 && (
          <div
            role="img"
            aria-label={`Question ${step + 1} of ${prompts.length}`}
            className="flex gap-1"
          >
            {prompts.map((item, index) => (
              <span
                key={item.id}
                className={cn(
                  "h-1 w-4 rounded-full",
                  index <= step ? "bg-foreground/70" : "bg-foreground/10",
                )}
              />
            ))}
          </div>
        )}
      </div>

      <Question
        key={prompt.id}
        prompt={prompt}
        draft={drafts[prompt.id]}
        onChange={(draft) => setDrafts((current) => ({ ...current, [prompt.id]: draft }))}
        onChoose={last ? undefined : () => setStep(step + 1)}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {step > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full px-4"
              disabled={sending}
              onClick={() => setStep(step - 1)}
            >
              <IconArrowLeft />
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full px-4 text-muted-foreground"
            disabled={sending}
            onClick={() => void decline()}
          >
            Decline
          </Button>
        </div>
        {last ? (
          <Button
            type="submit"
            size="sm"
            className="rounded-full px-4"
            disabled={!answered || sending}
          >
            <IconArrowUp />
            Send answer
          </Button>
        ) : (
          <Button type="submit" size="sm" className="rounded-full px-4" disabled={!answered}>
            Next
            <IconArrowRight />
          </Button>
        )}
      </div>
    </Form>
  );
}
