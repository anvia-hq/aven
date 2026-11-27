import {
  ChatProvider,
  ComposerPrimitive,
  useComposer,
  type ComposerInputEntity,
} from "@anvia/react-ui/chat";
import { IconArrowUp, IconX } from "@tabler/icons-react";
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
import type { Bot, BotChatQuote } from "../types";
import { BotAvatar } from "./bot-avatar";
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

function quotedBotOf(
  quoting: BotChatQuote,
  bot: Bot | undefined,
  bots: readonly Bot[],
): Bot | undefined {
  if (quoting.peer) {
    const peer = quoting.peer;

    return bots.find(
      (candidate) =>
        (peer.id !== undefined && candidate.id === peer.id) || candidate.handle === peer.handle,
    );
  }

  if (quoting.role === "bot") return bot;

  return undefined;
}

function QuotePreview({
  author,
  text,
  mine,
  quotedBot,
  onClear,
}: {
  author: string;
  text: string;
  mine: boolean;
  quotedBot?: Pick<Bot, "id" | "avatar">;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-slot="quoting"
      className="m-1.5 mb-0 flex items-center gap-2.5 rounded-2xl border border-foreground/8 bg-foreground/[0.045] px-2.5 py-2"
    >
      {mine || !quotedBot ? (
        <span
          aria-hidden
          className="grid size-6.5 shrink-0 place-items-center rounded-full bg-foreground/10 text-xs font-semibold text-foreground"
        >
          {author.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        <BotAvatar bot={quotedBot} steady className="size-6.5 shrink-0" />
      )}
      <Button
        variant="ghost"
        aria-expanded={open}
        title={open ? "Show less" : "Show more"}
        onClick={() => setOpen((value) => !value)}
        className="h-auto min-w-0 flex-1 flex-col items-stretch justify-start gap-0 rounded-md p-0 text-left text-sm font-normal whitespace-normal hover:bg-transparent"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <span>{author}</span>
          <span className="text-[11px] font-medium text-muted-foreground">· Replying</span>
        </span>
        <span
          className={cn(
            "block text-xs text-muted-foreground",
            open ? "max-h-40 overflow-y-auto whitespace-pre-wrap" : "line-clamp-1",
          )}
        >
          {text}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="relative size-7 shrink-0 rounded-full bg-foreground/[0.06] text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-foreground/10 hover:text-foreground"
        aria-label="Stop quoting"
        onClick={onClear}
      >
        <IconX className="size-3.5" />
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
        <Composer {...props} bot={bot} bots={bots} color={color} draftId={`bot-${botId}`} />
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
  bot,
  bots,
  color,
  draftId,
}: Omit<Props, "botId"> & {
  bot?: Bot;
  bots: readonly Bot[];
  color?: string;
  draftId: string;
}) {
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
          mine={quoting.role === "user" && !quoting.peer}
          quotedBot={quotedBotOf(quoting, bot, bots)}
          onClear={onClearQuote}
        />
      )}
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
          renderEntity={entity}
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
            <IconArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
