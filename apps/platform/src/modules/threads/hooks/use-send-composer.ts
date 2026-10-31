import type { ComposerSubmitMessageArgs, useComposer } from "@anvia/react-ui/chat";
import { MENTION_LIMIT } from "@aven/protocol/events";
import { useState } from "react";

import { toast } from "@/components/toast";

import { mentionOf } from "../mentions";
import type { MessageMention, OutgoingMessage, RunSelection } from "../types";
import type { useAttachments } from "./use-attachments";

type Draft = Pick<ComposerSubmitMessageArgs, "input" | "entities">;

// The prompt as sent: trimmed, with its mentions moved to where their tokens are in it.
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

type Options = {
  composer: ReturnType<typeof useComposer>;
  attachments: ReturnType<typeof useAttachments>;
  selection: RunSelection;
  /** The agent is working: nothing can be sent. */
  running: boolean;
  // Resolves to whether the message was taken; the text and files are only cleared when it was.
  onSubmit: (message: OutgoingMessage, selection: RunSelection) => boolean | Promise<boolean>;
};

// Sending what the composer holds: its text, mentions and files, with the model picked for it.
export function useSendComposer({ composer, attachments, selection, running, onSubmit }: Options) {
  const [sending, setSending] = useState(false);
  const hasContent = composer.input.trim().length > 0 || attachments.files.length > 0;
  const canSend = hasContent && !running && !sending;

  async function submit() {
    if (!canSend) return;
    const { prompt, mentions } = outgoing(composer);
    if (mentions.length > MENTION_LIMIT) {
      toast.add({
        title: "Too many mentions",
        description: `A message can mention ${MENTION_LIMIT} files and skills`,
        type: "error",
      });
      return;
    }
    setSending(true);
    try {
      const files = await attachments.encode();
      const sent = await onSubmit({ prompt, attachments: files, mentions }, selection);
      if (sent) {
        composer.setInput("");
        composer.setEntities([]);
        attachments.clear();
      }
    } catch (error) {
      // A picked file can no longer be read, say it was moved; the message stays to send again.
      toast.add({
        title: "Could not read the attached files",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  return { canSend, submit };
}
