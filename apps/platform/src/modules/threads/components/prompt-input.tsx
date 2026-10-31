import {
  ChatProvider,
  ComposerPrimitive,
  useComposer,
  type ComposerInputEntity,
  type ComposerSubmitMessageArgs,
  type ComposerTriggerItem,
  type ComposerTriggerState,
} from "@anvia/react-ui/chat";
import { ArrowUp, Paperclip, Stop } from "@mynaui/icons-react";
import { MENTION_LIMIT } from "@aven/protocol/events";
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
import { toast } from "@/components/toast";

import { useAttachments } from "../hooks/use-attachments";
import { useComposerChat } from "../hooks/use-composer-chat";
import { mentionOf, useMentions } from "../hooks/use-mentions";
import { useModelSelection } from "../hooks/use-model-selection";
import type { MessageMention, OutgoingMessage, RunSelection } from "../types";
import { PendingAttachments } from "./attachment-list";
import { MentionChip } from "./mention-chip";
import { ModelMenu } from "./model-menu";

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
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const model = useModelSelection(threadId);
  const attachments = useAttachments();
  const hasContent = composer.input.trim().length > 0 || attachments.files.length > 0;
  const canSend = hasContent && !running && !sending;

  useEffect(() => {
    if (autoFocus) editor.current?.querySelector<HTMLElement>("[contenteditable]")?.focus();
  }, [autoFocus]);

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
      const sent = await onSubmit({ prompt, attachments: files, mentions }, model.selection);
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

// What the menu says while it has nothing to pick.
function emptyMenu({ loading, trigger }: ComposerTriggerState) {
  if (loading) return "Searching…";
  return trigger.id === "file" ? "No file matches" : "No skill matches";
}

// One choice of the menu. The arrow keys move the selection, but Anvia leaves the list where it
// was, so a choice past the edge is scrolled into view here.
function MentionOption({
  item,
  index,
  selected,
}: {
  item: ComposerTriggerItem;
  index: number;
  selected: boolean;
}) {
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (selected) label.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <ComposerPrimitive.TriggerItem
      index={index}
      className="flex min-w-0 shrink-0 items-baseline gap-2 rounded-md px-2 py-1.5 text-left data-[state=selected]:bg-accent data-[state=selected]:text-accent-foreground"
    >
      <span ref={label} className="shrink-0 font-mono">
        {item.label}
      </span>
      {item.detail ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>
      ) : null}
    </ComposerPrimitive.TriggerItem>
  );
}

// What `@` or `/` found, above the composer: the composer sits at the foot of the page, so a
// menu at the caret, where Anvia places it, would open off screen.
function MentionMenu() {
  return (
    <ComposerPrimitive.TriggerMenu
      aria-label="Mention"
      className="absolute inset-x-0 bottom-full z-20 mb-1 flex max-h-72 flex-col overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      // Anvia pins the menu to the caret; here it belongs to the composer instead.
      style={{ position: "absolute", top: "auto", left: 0 }}
    >
      {(trigger) =>
        trigger.items.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground">{emptyMenu(trigger)}</p>
        ) : (
          trigger.items.map((item, index) => (
            <MentionOption
              key={item.id}
              item={item}
              index={index}
              selected={index === trigger.selectedIndex}
            />
          ))
        )
      }
    </ComposerPrimitive.TriggerMenu>
  );
}
