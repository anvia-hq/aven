import type { ComposerSubmitMessageArgs, useComposer } from "@anvia/react-ui/chat";
import { MENTION_LIMIT } from "@aven/protocol/events";
import { useRef, useState } from "react";

import { toast } from "@/components/toast";

import { COMPACT_COMMAND, mentionOf } from "../mentions";
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

// Whether the composer holds nothing but the `/compact` command, picked from the `/` menu.
function isCompactCommand({ input, entities }: Draft) {
  const [only] = entities;
  return entities.length === 1 && only?.id === COMPACT_COMMAND && input.trim() === only.text;
}

type Options = {
  composer: ReturnType<typeof useComposer>;
  attachments: ReturnType<typeof useAttachments>;
  selection: RunSelection;
  /** The agent is working: what is sent steers it (decision 0098), and files cannot go with it. */
  running: boolean;
  // Resolves to whether the message was taken; the text and files are only cleared when it was.
  onSubmit: (message: OutgoingMessage, selection: RunSelection) => boolean | Promise<boolean>;
  /** Runs the `/compact` command with the model the composer shows, when the composer holds only it. */
  onCompact?: (selection: RunSelection) => boolean | Promise<boolean>;
};

// Sending what the composer holds: its text, mentions and files, with the model picked for it.
export function useSendComposer({
  composer,
  attachments,
  selection,
  running,
  onSubmit,
  onCompact,
}: Options) {
  const [sending, setSending] = useState(false);
  // The composer as it is now, for a send that ends after the person has gone on typing.
  const latest = useRef(composer);
  latest.current = composer;
  const hasContent = composer.input.trim().length > 0 || attachments.files.length > 0;
  const canSend = hasContent && !sending && !(running && attachments.files.length > 0);

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
    // To an agent that is working the message shows at once as queued (decision 0098), so the
    // composer is cleared at once too, ready for the next, and given the message back if it was not
    // sent. Otherwise it is cleared when the message is taken.
    const draft = { input: composer.input, entities: composer.entities };
    const optimistic = running && attachments.files.length === 0;
    if (optimistic) {
      composer.setInput("");
      composer.setEntities([]);
    } else {
      setSending(true);
    }
    try {
      const files = await attachments.encode();
      const sent = await onSubmit({ prompt, attachments: files, mentions }, selection);
      if (sent) {
        if (!optimistic) {
          composer.setInput("");
          composer.setEntities([]);
        }
        attachments.clear();
      } else if (optimistic) {
        // Not sent: back in the composer, unless the person has begun another message, which is
        // not replaced; its words are in the notice instead.
        if (latest.current.input.trim() === "") {
          latest.current.setInput(draft.input);
          latest.current.setEntities(draft.entities);
        } else {
          toast.add({ title: "Your message was not sent", description: prompt, type: "error" });
        }
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

  return { canSend, hasContent, submit };
}
