import { CLAUDE_DEFAULT_EFFORT } from "@aven/protocol/claude-models";
import {
  ChatProvider,
  ComposerPrimitive,
  useComposer,
  type ComposerInputEntity,
  type ComposerTriggerItem,
} from "@anvia/react-ui/chat";
import { ArrowUp, Sparkles, StopSolid } from "@mynaui/icons-react";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/button";

import { useAttachmentDrop } from "../hooks/use-attachment-drop";
import { useAttachments } from "../hooks/use-attachments";
import { useComposerDraft } from "../hooks/use-composer-draft";
import { useComposerChat } from "../hooks/use-composer-chat";
import { useMentionPeople } from "../hooks/use-mention-people";
import { useMentions } from "../hooks/use-mentions";
import { useModelSelection } from "../hooks/use-model-selection";
import { useSendComposer } from "../hooks/use-send-composer";
import { AGENT_ENTITY, COMPACT_COMMAND, mentionOf, personIdOf } from "../mentions";
import type { AgentControl, MentionPerson, OutgoingMessage, RunSelection } from "../types";
import { AttachButton } from "./attach-button";
import { CommandChip, MentionChip } from "./mention-chip";
import { MentionMenu } from "./mention-menu";
import { AgentChip, PersonAvatar, PersonChip } from "./person-chip";
import { CodexModelMenu } from "./codex-model-menu";
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
  agent?: AgentControl;
};

const renderEntity =
  (people: MentionPerson[]) =>
  ({ triggerId, id, text }: ComposerInputEntity) => {
    if (id === COMPACT_COMMAND) return <CommandChip name="compact" />;

    if (id === AGENT_ENTITY) return <AgentChip />;

    const personId = personIdOf(id);

    if (personId !== undefined) {
      const person = people.find((each) => each.id === personId);
      const name = person?.name ?? /^@\[(.*)\]\(/.exec(text)?.[1] ?? "Teammate";
      return <PersonChip name={name} image={person?.image ?? null} />;
    }

    const mention = mentionOf(triggerId, id);
    return mention ? <MentionChip {...mention} /> : null;
  };

function personIcon(people: MentionPerson[], item: ComposerTriggerItem) {
  if (item.id === AGENT_ENTITY) return <Sparkles className="size-5 p-0.5" />;

  const id = personIdOf(item.id);

  if (id === undefined) return null;

  const person = people.find((each) => each.id === id);
  return person ? <PersonAvatar name={person.name} image={person.image} /> : null;
}

export function PromptInput({ threadId, ...props }: Props) {
  const chat = useComposerChat();
  const people = useMentionPeople(threadId);
  const triggers = useMentions(threadId, people);
  return (
    <ChatProvider controller={chat}>
      <ComposerPrimitive.Root
        key={threadId}
        triggers={triggers}
        className="contents"
        onSubmit={(event) => event.preventDefault()}
      >
        <Composer threadId={threadId} people={people} {...props} />
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
  agent,
  people,
}: Props & { people: MentionPerson[] }) {
  const composer = useComposer();
  const editor = useRef<HTMLDivElement>(null);
  const model = useModelSelection(threadId);
  useComposerDraft(threadId, composer);
  const attachments = useAttachments();
  const drop = useAttachmentDrop(attachments);
  const { canSend, submit } = useSendComposer({
    composer,
    attachments,
    selection: agent?.choice
      ? {
          modelId: agent.choice.modelId,
          reasoningEffort:
            agent.choice.backend === "claude"
              ? (agent.choice.effort ?? CLAUDE_DEFAULT_EFFORT)
              : undefined,
        }
      : model.selection,
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
      <MentionMenu icon={(item) => personIcon(people, item)} />
      <ComposerPrimitive.Input
        ref={editor}
        aria-label="Prompt"
        placeholder={placeholder}
        renderEntity={renderEntity(people)}
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
          {agent?.only && agent.choice?.backend === "codex" ? (
            <CodexModelMenu
              modelId={agent.choice.modelId}
              onChange={(modelId) => agent.onChange({ backend: "codex", modelId })}
            />
          ) : (
            <ModelMenu model={model} agent={agent} />
          )}
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
