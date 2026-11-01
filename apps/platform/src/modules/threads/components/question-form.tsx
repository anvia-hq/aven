import { ArrowLeft, ArrowRight, ArrowUp } from "@mynaui/icons-react";
import { cn } from "cn";
import { useState } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { RadioGroup, RadioGroupItem } from "@/components/radio-group";

import { useModelSelection } from "../hooks/use-model-selection";
import type { QuestionAnswer, QuestionPrompt, RunSelection, ToolPart } from "../types";

type Props = {
  tool: ToolPart;
  threadId: string;
  // Resolves to whether the answers were taken, like the composer's `onSubmit`.
  onSubmit: (answers: QuestionAnswer[], selection: RunSelection) => boolean | Promise<boolean>;
};

// What the user has so far for one question: a picked choice, or their own words, which win.
export type Draft = { choice: string; custom: string };

export const valueOf = (draft: Draft | undefined) => draft?.custom.trim() || draft?.choice || "";

export function Question({
  prompt,
  draft,
  onChange,
}: {
  prompt: QuestionPrompt;
  draft: Draft | undefined;
  onChange: (draft: Draft) => void;
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
          onValueChange={(choice) => onChange({ choice: String(choice), custom: "" })}
          className="gap-1.5"
        >
          {prompt.choices?.map((choice) => (
            <Label
              key={choice.value}
              className="cursor-pointer gap-3 rounded-lg border px-3 py-2.5 font-normal transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-accent"
            >
              <RadioGroupItem value={choice.value} />
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
          className="h-9"
        />
      )}
    </div>
  );
}

// Takes the composer's place while the agent waits on its question, one question at a time. The
// model is the one the composer would use, since the run continues with it.
export function QuestionForm({ tool, threadId, onSubmit }: Props) {
  const model = useModelSelection(threadId);
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

  if (!prompt) return null;

  return (
    <Form
      aria-label="Answer the agent"
      onFormSubmit={() => (last ? void submit() : answered && setStep(step + 1))}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>The agent needs your answer</span>
        {prompts.length > 1 && (
          <div className="flex items-center gap-2">
            <span>
              {step + 1} of {prompts.length}
            </span>
            <div className="flex gap-1" aria-hidden>
              {prompts.map((item, index) => (
                <span
                  key={item.id}
                  className={cn("h-1 w-5 rounded-full", index <= step ? "bg-primary" : "bg-border")}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <Question
        key={prompt.id}
        prompt={prompt}
        draft={drafts[prompt.id]}
        onChange={(draft) => setDrafts((current) => ({ ...current, [prompt.id]: draft }))}
      />

      <div className="flex items-center justify-between">
        {step > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
            <ArrowLeft />
            Back
          </Button>
        ) : (
          <span />
        )}
        {last ? (
          <Button type="submit" size="sm" disabled={!answered || sending}>
            <ArrowUp />
            Send answer
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={!answered}>
            Next
            <ArrowRight />
          </Button>
        )}
      </div>
    </Form>
  );
}
