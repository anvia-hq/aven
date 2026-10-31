import {
  ChatProvider,
  ComposerPrimitive,
  useComposer,
  type ComposerInputEntity,
} from "@anvia/react-ui/chat";
import { ArrowUp, Paperclip, Stop } from "@mynaui/icons-react";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";

import { useAttachments } from "../hooks/use-attachments";
import { useComposerChat } from "../hooks/use-composer-chat";
import { useMentions } from "../hooks/use-mentions";
import { useModelSelection } from "../hooks/use-model-selection";
import { useSendComposer } from "../hooks/use-send-composer";
import { mentionOf } from "../mentions";
import type { OutgoingMessage, RunSelection } from "../types";
import { MentionChip } from "./mention-chip";
import { MentionMenu } from "./mention-menu";
import { ModelMenu } from "./model-menu";
import { PendingAttachments } from "./pending-attachments";

type Props = {
  // Resolves to whether the message was taken; the text and files are only cleared when it was.
  onSubmit: (message: OutgoingMessage, selection: RunSelection) => boolean | Promise<boolean>;
  placeholder?: string;
  /** The agent is working: nothing can be sent, and Send gives way to Stop. */
  running?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
  /** The thread this composer replies in, whose own model choice it uses; none for a new thread. */
  threadId?: string;
  /** More controls for the toolbar, beside the attach button, such as the project of a new thread. */
  tools?: ReactNode;
};

const renderEntity = ({ triggerId, id }: ComposerInputEntity) => {
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
  autoFocus,
  threadId,
  tools,
}: Props) {
  const composer = useComposer();
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const model = useModelSelection(threadId);
  const attachments = useAttachments();
  const { canSend, submit } = useSendComposer({
    composer,
    attachments,
    selection: model.selection,
    running,
    onSubmit,
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

  // A pasted screenshot or file is attached; pasted text is left to the editor.
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (event.clipboardData.files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    attachments.add(event.clipboardData.files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    setDragging(false);
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    attachments.add(event.dataTransfer.files);
  }

  return (
    <div
      className="relative flex flex-col rounded-lg border bg-card p-2 focus-within:border-ring data-[dragging]:border-ring data-[dragging]:bg-accent/40"
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDropCapture={handleDrop}
      onPasteCapture={handlePaste}
      onKeyDownCapture={handleKeyDown}
    >
      <PendingAttachments files={attachments.files} onRemove={attachments.remove} />
      <MentionMenu />
      <ComposerPrimitive.Input
        ref={editor}
        aria-label="Prompt"
        placeholder={placeholder}
        renderEntity={renderEntity}
        className="max-h-60 min-h-14 overflow-y-auto p-1 text-sm leading-6"
      />
      <div className="flex items-center gap-2 pt-2">
        <Input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) attachments.add(event.target.files);
            // Picking the same file again must still count as a change.
            event.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Attach files"
          title="Attach files: images are shown to the model, every file is copied into the sandbox"
          onClick={() => picker.current?.click()}
        >
          <Paperclip />
        </Button>
        {tools}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <ModelMenu model={model} />
          {running ? (
            <Button size="icon-sm" aria-label="Stop" onClick={onStop}>
              <Stop />
            </Button>
          ) : (
            <Button
              size="icon-sm"
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
