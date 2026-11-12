import {
  ChatProvider,
  ComposerPrimitive,
  useComposer,
  type ComposerInputEntity,
} from "@anvia/react-ui/chat";
import { ArrowUp } from "@mynaui/icons-react";
import { cn } from "cn";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { AttachButton } from "@/modules/threads/components/attach-button";
import { MentionMenu } from "@/modules/threads/components/mention-menu";
import { PendingAttachments } from "@/modules/threads/components/pending-attachments";
import { useAttachmentDrop } from "@/modules/threads/hooks/use-attachment-drop";
import { useAttachments } from "@/modules/threads/hooks/use-attachments";
import { useComposerChat } from "@/modules/threads/hooks/use-composer-chat";
import type { AttachmentUpload } from "@/modules/threads/types";
import { toast } from "@/components/toast";

import { useBotMentions } from "../hooks/use-bot-mentions";
import { BotMentionChip } from "./bot-mention-chip";
import { MentionChip } from "@/modules/threads/components/mention-chip";
import { MentionIcon } from "./mention-icon";
import { ThreadMentionChip } from "./thread-mention-chip";

const SINGLE_LINE_HEIGHT = 40;

type Props = {
  botId: string;
  main: boolean;
  onSend: (text: string, files: AttachmentUpload[]) => Promise<boolean>;
  placeholder: string;
};

function avatarOf(data: ComposerInputEntity["data"]) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "";

  const { avatar } = data as { avatar?: unknown };
  return typeof avatar === "string" ? avatar : "";
}

function kindOf(data: ComposerInputEntity["data"]) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "";

  const { kind } = data as { kind?: unknown };
  return kind;
}

const renderEntity = ({ triggerId, id, label, data }: ComposerInputEntity) => {
  if (triggerId === "skill") return <MentionChip type="skill" name={id} />;

  if (triggerId !== "bot") return null;

  if (kindOf(data) === "thread") return <ThreadMentionChip id={id} title={label} />;

  return <BotMentionChip bot={{ id, name: label, avatar: avatarOf(data) }} />;
};

export function BotComposer({ botId, main, ...props }: Props) {
  const chat = useComposerChat();
  const triggers = useBotMentions(botId, main);
  return (
    <ChatProvider controller={chat}>
      <ComposerPrimitive.Root
        triggers={triggers}
        className="contents"
        onSubmit={(event) => event.preventDefault()}
      >
        <Composer {...props} />
      </ComposerPrimitive.Root>
    </ChatProvider>
  );
}

function Composer({ onSend, placeholder }: Omit<Props, "botId" | "main">) {
  const composer = useComposer();
  const attachments = useAttachments();
  const drop = useAttachmentDrop(attachments);
  const [sending, setSending] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const message = composer.input.trim();
  const canSend = (message.length > 0 || attachments.files.length > 0) && !sending;

  useEffect(() => {
    if (composer.input.length === 0) {
      setExpanded(false);
      return;
    }

    const box = editor.current;

    if (!box) return;

    if (composer.input.includes("\n") || box.scrollHeight > SINGLE_LINE_HEIGHT) setExpanded(true);
  }, [composer.input]);

  const submit = async () => {
    if (!canSend) return;

    setSending(true);
    try {
      const files = await attachments.encode();

      if (await onSend(message, files)) {
        composer.setInput("");
        composer.setEntities([]);
        attachments.clear();
      }
    } catch (error) {
      toast.add({
        title: "Could not read the attached files",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

    if (composer.activeTrigger?.items.length) return;

    event.preventDefault();
    event.stopPropagation();
    void submit();
  };

  return (
    <div
      className="relative rounded-3xl border bg-card focus-within:border-ring data-[dragging]:border-ring data-[dragging]:bg-accent/40"
      {...drop}
      onKeyDownCapture={onKeyDown}
    >
      <PendingAttachments files={attachments.files} onRemove={attachments.remove} />
      <div
        data-expanded={expanded || undefined}
        className="grid grid-cols-[auto_1fr_auto] items-end gap-x-1 py-2 pr-2 pl-2 [grid-template-areas:'attach_input_send'] data-expanded:[grid-template-areas:'input_input_input''attach_._send']"
      >
        <MentionMenu icon={(item) => <MentionIcon item={item} />} />
        <div className="flex h-9 shrink-0 items-center [grid-area:attach]">
          <AttachButton
            onPick={attachments.add}
            title="Attach files: images are shown to the bot, every file is copied to its computer"
          />
        </div>
        <ComposerPrimitive.Input
          ref={editor}
          aria-label="Message"
          placeholder={placeholder}
          renderEntity={renderEntity}
          className={cn(
            "max-h-48 min-h-9 min-w-0 overflow-y-auto py-1.5 text-sm leading-6 [grid-area:input]",
            expanded && "px-2",
          )}
        />
        <div className="flex h-9 shrink-0 items-center [grid-area:send]">
          <Button
            size="icon-sm"
            className="size-9 rounded-full md:size-8"
            aria-label="Send"
            disabled={!canSend}
            onClick={() => void submit()}
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
