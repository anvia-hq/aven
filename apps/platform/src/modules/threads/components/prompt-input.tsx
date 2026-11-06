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
  // Resolves to whether the message was taken; the text and files are only cleared when it was.
  onSubmit: (message: OutgoingMessage, selection: RunSelection) => boolean | Promise<boolean>;
  placeholder?: string;
  /** The agent is working: Stop is there, and what is sent steers it (decision 0098). */
  running?: boolean;
  onStop?: () => void;
  /** What `/compact` does, in a thread: summarize its history (decision 0097). */
  onCompact?: (selection: RunSelection) => boolean | Promise<boolean>;
  autoFocus?: boolean;
  /** The thread this composer replies in, whose own model choice it uses; none for a new thread. */
  threadId?: string;
  /** More controls for the toolbar, beside the attach button, such as the project of a new thread. */
  tools?: ReactNode;
};

const renderEntity = ({ triggerId, id }: ComposerInputEntity) => {
  if (id === COMPACT_COMMAND) return <CommandChip name="compact" />;
  const mention = mentionOf(triggerId, id);
  return mention ? <MentionChip {...mention} /> : null;
};

// The message composer: Anvia's tiptap Composer, where `@` mentions a file of the workspace and
// `/` a skill (decision 0036), with the files attached and the model picked per message.
export function PromptInput({ threadId, ...props }: Props) {
  const chat = useComposerChat();
  const triggers = useMentions(threadId);
  return (
    <ChatProvider controller={chat}>
      {/* Sending is `Composer`'s own; the form Anvia renders never submits. */}
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
  const { canSend, hasContent, submit } = useSendComposer({
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

  // Enter sends, unless the `@` or `/` menu has something to pick, which Enter then picks. Handled
  // before the editor sees it, so a message of files alone, or text after a `/` that matches no
  // skill, still sends.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Enter while composing text with an input method confirms a candidate; it is not a send.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (composer.activeTrigger?.items.length) return;
    event.preventDefault();
    event.stopPropagation();
    void submit();
  }

  // A click on the box that is not on a control, its padding and the space beside the toolbar, puts
  // the cursor in the field.
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
        // The editor is as tall as the field, so a click anywhere in it puts the cursor there.
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
              variant={canSend ? "outline" : "default"}
              aria-label="Stop"
              onClick={onStop}
            >
              <StopSolid />
            </Button>
          )}
          {/* While the agent works Send is there only with something to say, beside Stop. */}
          {(!running || hasContent) && (
            <Button
              size="icon-sm"
              aria-label="Send"
              title={
                running && attachments.files.length > 0
                  ? "Files can be sent when the agent is not working"
                  : undefined
              }
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
