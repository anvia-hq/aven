import { IconArrowBackUp, IconCornerDownRight } from "@tabler/icons-react";

import { Bubble, BubbleContent } from "@aven/ui/bubble";
import { Button } from "@aven/ui/button";
import { ExternalLink, Markdown } from "@/components/markdown";
import { MessageContent } from "@aven/ui/message";
import { SentAttachments } from "@/modules/threads/components/sent-attachments";

import { cn } from "cn";

import { titleOf } from "../artifacts";
import { avatarFor, parseAvatarSetting } from "../avatar";
import { bubbleInk, bubbleStyle } from "@/lib/bubble-tint";
import { botIdOfHref, linkBotMentions } from "../mentions";
import { quoteAuthor } from "../quote";
import { useSwipeReply } from "../hooks/use-swipe-reply";
import type { Bot, BotChatMessage, BotChatQuote, MessageAttachment } from "../types";
import { BotMentionChip } from "./bot-mention-chip";
import { ArtifactCard } from "./artifact-card";
import { MentionedText } from "./mentioned-text";

export const isPersons = (message: BotChatMessage) => message.role === "user";

export function BotChatBubble({
  botId,
  bot,
  message,
  bots,
  previews,
  onQuote,
  onOpenArtifact,
  openArtifact,
  joined,
}: {
  botId: string;
  bot: Bot;
  message: BotChatMessage;
  bots: readonly Bot[];
  previews?: MessageAttachment[];
  onQuote: (message: BotChatMessage) => void;
  onOpenArtifact: (name: string) => void;
  openArtifact: string | undefined;
  joined?: { above: boolean; below: boolean };
}) {
  const mine = isPersons(message);
  const {
    direction,
    state: swipe,
    handlers: swipeHandlers,
  } = useSwipeReply({
    mine,
    onReply: () => onQuote(message),
  });
  const setting = parseAvatarSetting(bot.avatar);
  const tinted = setting !== null || bot.avatar === "" || bot.avatar.startsWith("{");
  const tint = tinted ? avatarFor(bot.id, setting ?? undefined).color : undefined;
  const actions = (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label="Quote this message"
      title="Quote this message"
      onClick={() => onQuote(message)}
      className="absolute -top-2.5 -right-1.5 z-10 hidden rounded-full border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/message:opacity-100 focus-visible:opacity-100 hover:text-foreground [@media(hover:hover)]:inline-flex"
    >
      <IconArrowBackUp />
    </Button>
  );
  const swipeIndicator = swipe.offset !== 0 && (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center transition-transform duration-150",
        direction === "right" ? "-left-10" : "-right-10",
        swipe.ready && "scale-110",
      )}
      style={{ opacity: Math.min(1, swipe.progress * 1.4) }}
    >
      <svg className="absolute inset-0 -rotate-90" width="32" height="32" viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="87.96"
          strokeDashoffset={87.96 * (1 - swipe.progress)}
          className={cn("text-primary transition-opacity", swipe.ready && "opacity-0")}
        />
      </svg>
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full border bg-card text-foreground shadow-sm transition-colors",
          swipe.ready && "border-primary bg-primary text-primary-foreground",
        )}
      >
        <IconArrowBackUp className="size-3.5" />
      </span>
    </div>
  );
  const swipeMotion = {
    style: swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined,
    ...swipeHandlers,
  };
  const reply = message.quote && (
    <ReplyTo quote={message.quote} bot={bot} bots={bots} mine={mine} />
  );

  return (
    <MessageContent>
      {message.attachments?.length ? (
        <SentAttachments
          artifactsPath={`/api/bots/${botId}/artifacts`}
          attachments={message.attachments}
          previews={previews}
        />
      ) : null}
      {(message.text || reply) &&
        (mine ? (
          <div
            {...swipeMotion}
            className={cn(
              "relative flex w-fit max-w-[80%] min-w-0 flex-col items-end gap-1 self-end",
              !swipe.dragging && "transition-transform duration-200 ease-out",
            )}
          >
            {swipeIndicator}
            {reply}
            {message.text && (
              <div className="relative w-fit max-w-full">
                <div
                  data-role="user"
                  style={bubbleStyle(tint)}
                  className={cn(
                    "rounded-3xl border border-foreground/10 bg-clip-padding px-4 py-2 text-[15px]/[22px] font-medium whitespace-pre-wrap",
                    tint === undefined &&
                      "bg-linear-to-b from-accent to-[color-mix(in_oklch,var(--accent),var(--foreground)_6%)]",
                    bubbleInk(tint),
                  )}
                >
                  <MentionedText text={message.text} bots={bots} />
                </div>
                {actions}
              </div>
            )}
          </div>
        ) : (
          <div
            {...swipeMotion}
            className={cn(
              "relative flex w-fit max-w-[80%] min-w-0 flex-col items-start gap-1",
              !swipe.dragging && "transition-transform duration-200 ease-out",
            )}
          >
            {swipeIndicator}
            {reply}
            {message.text && (
              <Bubble
                variant="muted"
                align="start"
                className="max-w-full *:data-[slot=bubble-content]:bg-transparent"
              >
                <BubbleContent
                  className={cn(
                    "rounded-3xl border-(--bot-bubble-border) bg-linear-to-b from-(--bot-bubble-from) to-(--bot-bubble-to) bg-clip-padding px-4 py-2.5 font-medium [&>.prose]:text-[15px] [&>.prose]:leading-[24px]",
                    joined?.above && "rounded-tl-lg",
                    joined?.below && "rounded-bl-lg",
                  )}
                >
                  <Markdown
                    components={{
                      a: ({ node: _node, href, children, ...props }) => {
                        const mentioned = bots.find((each) => each.id === botIdOfHref(href));

                        return mentioned ? (
                          <BotMentionChip bot={mentioned} />
                        ) : (
                          <ExternalLink href={href} {...props}>
                            {children}
                          </ExternalLink>
                        );
                      },
                    }}
                  >
                    {linkBotMentions(message.text, bots)}
                  </Markdown>
                </BubbleContent>
                {actions}
              </Bubble>
            )}
          </div>
        ))}
      {message.artifacts?.length ? (
        <div className="flex flex-col items-start gap-1.5">
          {message.artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.name}
              artifact={{ ...artifact, title: titleOf(artifact), messageId: message.id }}
              active={openArtifact === artifact.name}
              onOpen={() => onOpenArtifact(artifact.name)}
            />
          ))}
        </div>
      ) : null}
      {message.reactions?.length ? (
        <div data-slot="reactions" className="flex flex-wrap gap-1">
          {message.reactions.map((emoji) => (
            <span
              key={emoji}
              title="Reaction"
              className="rounded-full border bg-muted px-1.5 py-0.5 text-sm leading-5 select-none"
            >
              {emoji}
            </span>
          ))}
        </div>
      ) : null}
    </MessageContent>
  );
}

function ReplyTo({
  quote,
  bot,
  bots,
  mine,
}: {
  quote: BotChatQuote;
  bot: Pick<Bot, "name">;
  bots: readonly Bot[];
  mine: boolean;
}) {
  const author = quoteAuthor(quote, bot, bots);
  const preview = quote.text || "A file";

  return (
    <div
      data-slot="quote"
      className={cn(
        "flex max-w-md min-w-0 items-center gap-1.5 px-3 text-xs leading-5 text-muted-foreground",
        mine && "justify-end",
      )}
      title={`${author}: ${preview}`}
    >
      <IconCornerDownRight aria-hidden className="size-3 shrink-0 opacity-60" />
      <span className="shrink-0 font-medium text-muted-foreground/90">{author}</span>
      <span aria-hidden className="shrink-0 opacity-40">
        ·
      </span>
      <span className="truncate opacity-70">{preview}</span>
    </div>
  );
}
