import {
  ChatProvider,
  ComposerPrimitive,
  useComposer,
  type ComposerInputEntity,
} from "@anvia/react-ui/chat";
import { IconArrowBackUp, IconArrowUp, IconX } from "@tabler/icons-react";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@aven/ui/button";
import { AttachButton } from "@/modules/threads/components/attach-button";
import { MentionChip } from "@/modules/threads/components/mention-chip";
import { MentionMenu } from "@/modules/threads/components/mention-menu";
import { PendingAttachments } from "@/modules/threads/components/pending-attachments";
import { useAttachmentDrop } from "@/modules/threads/hooks/use-attachment-drop";
import { useAttachments } from "@/modules/threads/hooks/use-attachments";
import { useComposerChat } from "@/modules/threads/hooks/use-composer-chat";
import { useComposerDraft } from "@/modules/threads/hooks/use-composer-draft";
import type { AttachmentUpload } from "@/modules/threads/types";

import { avatarFor, parseAvatarSetting } from "../avatar";
import { useBotMentions } from "../hooks/use-bot-mentions";
import { useBotSendComposer } from "../hooks/use-bot-send-composer";
import { useBots } from "../hooks/use-bots";
import type { BotChatQuote } from "../types";
import { BotMentionChip } from "./bot-mention-chip";
import { MentionIcon } from "./mention-icon";
import { ThreadMentionChip } from "./thread-mention-chip";

const SINGLE_LINE_HEIGHT = 40;

type Props = {
  botId: string;
  onSend: (text: string, files: AttachmentUpload[]) => Promise<boolean>;
  placeholder: string;
  quoting: BotChatQuote | null;
  quoteAuthor: string;
  onClearQuote: () => void;
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

const renderEntity = (
  { triggerId, id, label, data }: ComposerInputEntity,
  color: string | undefined,
) => {
  if (triggerId === "skill") return <MentionChip type="skill" name={id} color={color} />;

  if (triggerId !== "bot") return null;

  if (kindOf(data) === "thread") return <ThreadMentionChip id={id} title={label} color={color} />;

  return <BotMentionChip bot={{ id, name: label, avatar: avatarOf(data) }} color={color} />;
};

function QuotePreview({
  author,
  text,
  onClear,
}: {
  author: string;
  text: string;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div data-slot="quoting" className="flex items-start gap-2.5 px-3 pt-3 pr-2 pb-1">
      <div className="w-0.5 shrink-0 self-stretch rounded-full bg-primary" />
      <Button
        variant="ghost"
        aria-expanded={open}
        title={open ? "Show less" : "Show more"}
        onClick={() => setOpen((value) => !value)}
        className="h-auto min-w-0 flex-1 flex-col items-stretch justify-start gap-0 rounded-md p-0 text-left text-sm font-normal whitespace-normal hover:bg-transparent"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <IconArrowBackUp className="size-3.5 shrink-0" />
          Replying to {author}
        </span>
        <span
          className={cn(
            "block text-muted-foreground",
            open ? "max-h-40 overflow-y-auto whitespace-pre-wrap" : "line-clamp-2",
          )}
        >
          {text}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 rounded-full"
        aria-label="Stop quoting"
        onClick={onClear}
      >
        <IconX />
      </Button>
    </div>
  );
}

export function BotComposer({ botId, ...props }: Props) {
  const chat = useComposerChat();
  const triggers = useBotMentions(botId);
  const { bots } = useBots();
  const bot = bots.find((candidate) => candidate.id === botId);
  const color = bot
    ? avatarFor(bot.id, parseAvatarSetting(bot.avatar) ?? undefined).color
    : undefined;
  return (
    <ChatProvider controller={chat}>
      <ComposerPrimitive.Root
        key={botId}
        triggers={triggers}
        className="contents"
        onSubmit={(event) => event.preventDefault()}
      >
        <Composer {...props} color={color} draftId={`bot-${botId}`} />
      </ComposerPrimitive.Root>
    </ChatProvider>
  );
}

function Composer({
  onSend,
  placeholder,
  quoting,
  quoteAuthor,
  onClearQuote,
  color,
  draftId,
}: Omit<Props, "botId"> & { color?: string; draftId: string }) {
  const composer = useComposer();
  const entity = useCallback((found: ComposerInputEntity) => renderEntity(found, color), [color]);
  const attachments = useAttachments(draftId);
  useComposerDraft(draftId, composer, attachments);
  const drop = useAttachmentDrop(attachments);
  const { canSend, submit } = useBotSendComposer({ composer, attachments, onSend });
  const editor = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (composer.input.length === 0) {
      setExpanded(false);
      return;
    }

    const box = editor.current;

    if (!box) return;

    if (composer.input.includes("\n") || box.scrollHeight > SINGLE_LINE_HEIGHT) setExpanded(true);
  }, [composer.input]);

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
      {quoting && (
        <QuotePreview
          key={quoting.id}
          author={quoteAuthor}
          text={quoting.text || "A file"}
          onClear={onClearQuote}
        />
      )}
      <PendingAttachments files={attachments.files} onRemove={attachments.remove} />
      <div
        data-expanded={expanded || undefined}
        className="grid grid-cols-[auto_1fr_auto] items-center gap-x-1 py-2 pr-2 pl-2 [grid-template-areas:'attach_input_send'] data-expanded:items-end data-expanded:[grid-template-areas:'input_input_input''attach_._send']"
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
          renderEntity={entity}
          className={cn(
            "max-h-48 min-h-9 min-w-0 overflow-y-auto py-1.5 text-base leading-6 md:text-sm [grid-area:input] [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-6 [&_.ProseMirror_p.is-editor-empty:first-child::before]:max-w-full [&_.ProseMirror_p.is-editor-empty:first-child::before]:truncate",
            expanded && "px-2",
          )}
        />
        <div className="flex h-9 shrink-0 items-center [grid-area:send]">
          <Button
            size="icon-sm"
            className="size-9 rounded-full md:size-7"
            aria-label="Send"
            disabled={!canSend}
            onClick={() => void submit()}
          >
            <IconArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
