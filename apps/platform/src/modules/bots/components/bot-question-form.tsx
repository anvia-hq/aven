import { IconArrowLeft, IconArrowRight, IconArrowUp } from "@tabler/icons-react";
import { cn } from "cn";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { Question, valueOf } from "@/modules/threads/components/question-form";

import { answerText } from "../questions";
import type { BotQuestion } from "../types";
import type { Draft } from "@/modules/threads/types";

export function BotQuestionForm({
  botName,
  questions,
  onSubmit,
}: {
  botName: string;
  questions: readonly BotQuestion[];
  onSubmit: (text: string) => boolean | Promise<boolean>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);

  const prompt = questions[step];
  const last = step === questions.length - 1;
  const answered = Boolean(prompt && valueOf(drafts[prompt.id]));

  async function submit() {
    if (sending) return;

    setSending(true);
    const values = Object.fromEntries(
      questions.map((question) => [question.id, valueOf(drafts[question.id])]),
    );

    if (!(await onSubmit(answerText(questions, values)))) setSending(false);
  }

  if (!prompt) return null;

  return (
    <Form
      aria-label={`Answer ${botName}`}
      onFormSubmit={() => (last ? void submit() : answered && setStep(step + 1))}
      className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-border/50 bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground/80">
        <span>{botName} needs your answer</span>
        {questions.length > 1 && (
          <div
            role="img"
            aria-label={`Question ${step + 1} of ${questions.length}`}
            className="flex gap-1"
          >
            {questions.map((item, index) => (
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
      />

      <div className="flex items-center justify-between">
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full px-4"
            onClick={() => setStep(step - 1)}
          >
            <IconArrowLeft />
            Back
          </Button>
        ) : (
          <span />
        )}
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
