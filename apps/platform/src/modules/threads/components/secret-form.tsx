import { ArrowUp, Lock } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { RadioGroup, RadioGroupItem } from "@/components/radio-group";

import { useModelSelection } from "../hooks/use-model-selection";
import type { QuestionAnswer, RunSelection, SecretChoice, ToolPart } from "../types";

type Props = {
  tool: ToolPart;
  threadId: string;
  // Resolves to whether the answer was taken, like the composer's `onSubmit`.
  onSubmit: (
    answers: QuestionAnswer[],
    selection: RunSelection,
    secret: SecretChoice,
  ) => boolean | Promise<boolean>;
};

const SCOPES = [
  { value: "project", label: "This project" },
  { value: "personal", label: "Only me" },
] as const;

// Takes the composer's place while the agent waits on a request for a secret (decision 0047): a
// masked field for each, and whose variable it becomes. The agent never sees the value; it is
// stored encrypted and the agent uses it by name. The model is the one the composer would use,
// since the run continues with it.
export function SecretForm({ tool, threadId, onSubmit }: Props) {
  const model = useModelSelection(threadId);
  const prompts = tool.questions ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<SecretChoice["secretScope"]>("project");
  const [sending, setSending] = useState(false);

  const complete = prompts.every((prompt) => (values[prompt.id] ?? "").trim() !== "");

  async function submit(skip: boolean) {
    if (sending) return;
    setSending(true);
    await onSubmit(
      // A declined request still names each question; the control plane tells the agent so.
      prompts.map((prompt) => ({
        questionId: prompt.id,
        value: skip ? "declined" : (values[prompt.id] ?? ""),
      })),
      model.selection,
      { secretScope: scope, skipSecrets: skip || undefined },
    );
    setSending(false);
  }

  return (
    <Form
      aria-label="Provide a secret"
      onFormSubmit={() => complete && void submit(false)}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" />
        <span>The agent needs a secret. It will not see the value.</span>
      </div>

      {prompts.map((prompt) => (
        <div key={prompt.id} className="flex flex-col gap-2">
          <Label htmlFor={`secret-${prompt.id}`} className="text-base leading-6 font-medium">
            {prompt.text}
          </Label>
          <p className="font-mono text-xs text-muted-foreground">{prompt.id}</p>
          <Input
            id={`secret-${prompt.id}`}
            type="password"
            autoComplete="off"
            aria-label={prompt.text}
            placeholder="Paste it here"
            value={values[prompt.id] ?? ""}
            onChange={(event) => setValues((all) => ({ ...all, [prompt.id]: event.target.value }))}
            className="h-9 font-mono"
          />
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">Keep it for</p>
        <RadioGroup
          aria-label="Keep it for"
          value={scope}
          onValueChange={(value) => setScope(value as SecretChoice["secretScope"])}
          className="flex-row gap-1.5"
        >
          {SCOPES.map((option) => (
            <Label
              key={option.value}
              className="cursor-pointer gap-3 rounded-lg border px-3 py-2 font-normal transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-accent"
            >
              <RadioGroupItem value={option.value} />
              {option.label}
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={sending}
          onClick={() => void submit(true)}
        >
          Decline
        </Button>
        <Button type="submit" size="sm" disabled={!complete || sending}>
          <ArrowUp />
          Store and continue
        </Button>
      </div>
    </Form>
  );
}
