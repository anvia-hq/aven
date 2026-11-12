import type { ComposerSubmitMessageArgs, useComposer } from "@anvia/react-ui/chat";
import { MENTION_LIMIT } from "@aven/protocol/events";
import { useRef, useState } from "react";

import { toast } from "@/components/toast";

import { COMPACT_COMMAND, mentionOf } from "../mentions";
import type { MessageMention, OutgoingMessage, RunSelection } from "../types";
import type { useAttachments } from "./use-attachments";

type Draft = Pick<ComposerSubmitMessageArgs, "input" | "entities">;

function outgoing({ input, entities }: Draft) {
  const lead = input.length - input.trimStart().length;
  const mentions: MessageMention[] = [];
  for (const entity of entities) {
    const mention = mentionOf(entity.triggerId, entity.id);
    const from = entity.range.from - lead;

    if (mention) mentions.push({ ...mention, from, to: from + entity.text.length });
  }
  return { prompt: input.trim(), mentions };
}

function isCompactCommand({ input, entities }: Draft) {
  const [only] = entities;
  return entities.length === 1 && only?.id === COMPACT_COMMAND && input.trim() === only.text;
}

type Options = {
  composer: ReturnType<typeof useComposer>;
  attachments: ReturnType<typeof useAttachments>;
  selection: RunSelection;
  running: boolean;
  filesWhileRunning?: boolean;
  onSubmit: (message: OutgoingMessage, selection: RunSelection) => boolean | Promise<boolean>;
  onCompact?: (selection: RunSelection) => boolean | Promise<boolean>;
};

export function useSendComposer({
  composer,
  attachments,
  selection,
  running,
  filesWhileRunning = false,
  onSubmit,
  onCompact,
}: Options) {
  const [sending, setSending] = useState(false);
  const latest = useRef(composer);
  latest.current = composer;
  const hasText = composer.input.trim().length > 0;
  const hasContent = hasText || attachments.files.length > 0;
  const textOnly = running && !filesWhileRunning;
  const canSend = (textOnly ? hasText : hasContent) && !sending;

  async function submit() {
    if (!canSend) return;

    if (onCompact && attachments.files.length === 0 && isCompactCommand(composer)) {
      setSending(true);
      try {
        if (await onCompact(selection)) {
          composer.setInput("");
          composer.setEntities([]);
        }
      } finally {
        setSending(false);
      }
      return;
    }

    const { prompt, mentions } = outgoing(composer);

    if (mentions.length > MENTION_LIMIT) {
      toast.add({
        title: "Too many mentions",
        description: `A message can mention ${MENTION_LIMIT} files and skills`,
        type: "error",
      });
      return;
    }

    const draft = { input: composer.input, entities: composer.entities };
    composer.setInput("");
    composer.setEntities([]);
    const steering = running;

    if (!steering) setSending(true);

    try {
      const files = textOnly ? [] : await attachments.encode();
      const sent = await onSubmit({ prompt, attachments: files, mentions }, selection);

      if (sent) {
        if (!textOnly) attachments.clear();
      } else restore(draft, prompt);
    } catch (error) {
      restore(draft, prompt);
      toast.add({
        title: "Could not read the attached files",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  function restore(draft: Draft, prompt: string) {
    const current = latest.current.input;

    if (current.trim() === "" || current === draft.input) {
      latest.current.setInput(draft.input);
      latest.current.setEntities(draft.entities);
    } else {
      toast.add({ title: "Your message was not sent", description: prompt, type: "error" });
    }
  }

  return { canSend, submit };
}
