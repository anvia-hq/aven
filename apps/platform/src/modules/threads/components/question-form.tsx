import { ArrowUp } from "@mynaui/icons-react";
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
  // Resolves to whether the answers were taken, like the composer's `onSubmit`.
  onSubmit: (answers: QuestionAnswer[], selection: RunSelection) => boolean | Promise<boolean>;
};

// What the user has so far for one question: a picked choice, or their own words, which win.
type Draft = { choice: string; custom: string };

const valueOf = (draft: Draft | undefined) => draft?.custom.trim() || draft?.choice || "";

function Question({
  prompt,
  draft,
  onChange,
}: {
  prompt: QuestionPrompt;
  draft: Draft | undefined;
  onChange: (draft: Draft) => void;
}) {
  const current = draft ?? { choice: "", custom: "" };
  const own = prompt.allowCustom || !prompt.choices?.length;

  return (
    <div role="group" aria-label={prompt.text} className="flex flex-col gap-2">
      <p className="text-sm font-medium">{prompt.text}</p>
      {prompt.choices && (
        <RadioGroup
          aria-label={prompt.text}
          value={current.custom.trim() ? "" : current.choice}
          onValueChange={(choice) => onChange({ choice: String(choice), custom: "" })}
          className="gap-1.5"
        >
          {prompt.choices.map((choice) => (
            <Label key={choice.value} className="gap-2 font-normal">
              <RadioGroupItem value={choice.value} />
              {choice.label}
            </Label>
          ))}
        </RadioGroup>
      )}
      {own && (
        <Input
          aria-label={prompt.choices?.length ? `${prompt.text} (your own answer)` : prompt.text}
          placeholder={prompt.choices?.length ? "Or write your own answer" : "Your answer"}
          value={current.custom}
          onChange={(event) => onChange({ choice: "", custom: event.target.value })}
        />
      )}
    </div>
  );
}

// Takes the composer's place while the agent waits on its question. The model is the one the
// composer would use, since the run continues with it.
export function QuestionForm({ tool, onSubmit }: Props) {
  const model = useModelSelection();
  const prompts = tool.questions ?? [];
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sending, setSending] = useState(false);
  const answers = prompts.map((prompt) => ({
    questionId: prompt.id,
    value: valueOf(drafts[prompt.id]),
  }));
  const complete = answers.every((answer) => answer.value);

  async function submit() {
    if (!complete || sending) return;
    setSending(true);
    await onSubmit(answers, model.selection);
    setSending(false);
  }

  return (
    <Form
      aria-label="Answer the agent"
      onFormSubmit={() => void submit()}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <p className="text-xs text-muted-foreground">The agent is waiting for your answer.</p>
      {prompts.map((prompt) => (
        <Question
          key={prompt.id}
          prompt={prompt}
          draft={drafts[prompt.id]}
          onChange={(draft) => setDrafts((current) => ({ ...current, [prompt.id]: draft }))}
        />
      ))}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!complete || sending}>
          <ArrowUp />
          Send answer
        </Button>
      </div>
    </Form>
  );
}
