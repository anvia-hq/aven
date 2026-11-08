import {
  ChatProvider,
  ComposerPrimitive,
  useComposer,
  type ComposerInputEntity,
} from "@anvia/react-ui/chat";
import { ArrowUp, StopSolid } from "@mynaui/icons-react";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/button";

import { useAttachmentDrop } from "../hooks/use-attachment-drop";
import { useAttachments } from "../hooks/use-attachments";
import { useComposerChat } from "../hooks/use-composer-chat";
import { useMentions } from "../hooks/use-mentions";
import { useModelSelection } from "../hooks/use-model-selection";
import { useSendComposer } from "../hooks/use-send-composer";
import { COMPACT_COMMAND, mentionOf } from "../mentions";
import type { OutgoingMessage, RunSelection } from "../types";
import { AttachButton } from "./attach-button";
import { CommandChip, MentionChip } from "./mention-chip";
import { MentionMenu } from "./mention-menu";
import { ModelMenu } from "./model-menu";
import { PendingAttachments } from "./pending-attachments";

type Props = {
  onSubmit: (message: OutgoingMessage, selection: RunSelection) => boolean | Promise<boolean>;
  placeholder?: string;
  running?: boolean;
  onStop?: () => void;
  onCompact?: (selection: RunSelection) => boolean | Promise<boolean>;
  autoFocus?: boolean;
  threadId?: string;
  tools?: ReactNode;
};

const renderEntity = ({ triggerId, id }: ComposerInputEntity) => {
  if (id === COMPACT_COMMAND) return <CommandChip name="compact" />;
  const mention = mentionOf(triggerId, id);
  return mention ? <MentionChip {...mention} /> : null;
};

export function PromptInput({ threadId, ...props }: Props) {
  const chat = useComposerChat();
  const triggers = useMentions(threadId);
  return (
    <ChatProvider controller={chat}>
      <ComposerPrimitive.Root
        triggers={triggers}
        className="contents"
        onSubmit={(event) => event.preventDefault()}
      >
        <Composer threadId={threadId} {...props} />
      </ComposerPrimitive.Root>
    </ChatProvider>
  );
}

function Composer({
  onSubmit,
  placeholder = "Ask anything about the codebase…",
  running = false,
  onStop,
  onCompact,
  autoFocus,
  threadId,
  tools,
}: Props) {
  const composer = useComposer();
  const editor = useRef<HTMLDivElement>(null);
  const model = useModelSelection(threadId);
  const attachments = useAttachments();
  const drop = useAttachmentDrop(attachments);
  const { canSend, submit } = useSendComposer({
    composer,
    attachments,
    selection: model.selection,
    running,
    onSubmit,
    onCompact,
  });

  useEffect(() => {
    if (autoFocus) editor.current?.querySelector<HTMLElement>("[contenteditable]")?.focus();
  }, [autoFocus]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (composer.activeTrigger?.items.length) return;
    event.preventDefault();
    event.stopPropagation();
    void submit();
  }

  function focusOnBoxClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, [contenteditable], [role='menu'], [role='listbox']"))
      return;
    editor.current?.querySelector<HTMLElement>("[contenteditable]")?.focus();
  }

  return (
    <div
      className="relative flex cursor-text flex-col rounded-lg border bg-card p-2 focus-within:border-ring data-[dragging]:border-ring data-[dragging]:bg-accent/40"
      {...drop}
      onKeyDownCapture={handleKeyDown}
      onClick={focusOnBoxClick}
    >
      <PendingAttachments files={attachments.files} onRemove={attachments.remove} />
      <MentionMenu />
      <ComposerPrimitive.Input
        ref={editor}
        aria-label="Prompt"
        placeholder={placeholder}
        renderEntity={renderEntity}
        className="max-h-60 min-h-14 overflow-y-auto p-1 text-sm leading-6 [&_.ProseMirror]:min-h-12 [&_.ProseMirror]:cursor-text"
      />
      <div className="flex items-center gap-2 pt-2">
        <AttachButton
          onPick={attachments.add}
          disabled={running}
          title={
            running
              ? "Files can be sent when the agent is not working"
              : "Attach files: images are shown to the model, every file is copied into the sandbox"
          }
        />
        {tools}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <ModelMenu model={model} />
          {running && (
            <Button
              size="icon-sm"
              className="size-9 rounded-full md:size-7"
              aria-label="Stop"
              onClick={onStop}
            >
              <StopSolid />
            </Button>
          )}
          {!running && (
            <Button
              size="icon-sm"
              className="size-9 rounded-full md:size-7"
              aria-label="Send"
              disabled={!canSend}
              onClick={() => void submit()}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
