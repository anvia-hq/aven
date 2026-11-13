import { MessageReply } from "@mynaui/icons-react";

import { Bubble, BubbleContent } from "@/components/bubble";
import { Button } from "@/components/button";
import { ExternalLink, Markdown } from "@/components/markdown";
import { MessageContent } from "@/components/message";
import { SentAttachments } from "@/modules/threads/components/sent-attachments";

import { cn } from "cn";

import { botIdOfHref, linkBotMentions } from "../mentions";
import { quoteAuthor } from "../quote";
import type { Bot, BotChatMessage, BotChatQuote } from "../types";
import { BotMentionChip } from "./bot-mention-chip";
import { MentionedText } from "./mentioned-text";

export const isPersons = (message: BotChatMessage) => message.role === "user";

export function BotChatBubble({
  botId,
  bot,
  message,
  bots,
  onQuote,
  joined,
}: {
  botId: string;
  bot: Bot;
  message: BotChatMessage;
  bots: readonly Bot[];
  onQuote: (message: BotChatMessage) => void;
  joined?: { above: boolean; below: boolean };
}) {
  const mine = isPersons(message);
  const actions = (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label="Quote this message"
      title="Quote this message"
      onClick={() => onQuote(message)}
      className="absolute -top-2.5 -right-1.5 z-10 rounded-full border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/message:opacity-100 focus-visible:opacity-100 hover:text-foreground"
    >
      <MessageReply />
    </Button>
  );
  const reply = message.quote && (
    <ReplyTo quote={message.quote} bot={bot} bots={bots} mine={mine} />
  );

  return (
    <MessageContent>
      {message.attachments?.length ? (
        <SentAttachments
          artifactsPath={`/api/bots/${botId}/artifacts`}
          attachments={message.attachments}
        />
      ) : null}
      {(message.text || reply) &&
        (mine ? (
          <div className="relative w-fit max-w-[80%] self-end">
            <div
              data-role="user"
              className="rounded-lg bg-accent px-3 py-2 text-sm whitespace-pre-wrap"
            >
              {reply}
              {message.text && <MentionedText text={message.text} bots={bots} />}
            </div>
            {actions}
          </div>
        ) : (
          <Bubble
            variant="muted"
            align="start"
            className="*:data-[slot=bubble-content]:bg-[color-mix(in_oklch,var(--muted),black_3%)]! dark:*:data-[slot=bubble-content]:bg-[color-mix(in_oklch,var(--muted),black_7%)]!"
          >
            <BubbleContent
              className={cn(
                "rounded-2xl",
                joined?.above && "rounded-tl-md",
                joined?.below && "rounded-bl-md",
              )}
            >
              {reply}
              {message.text && (
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
              )}
            </BubbleContent>
            {actions}
          </Bubble>
        ))}
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
  return (
    <div
      data-slot="quote"
      className={cn("mb-1.5 flex min-w-0 gap-2", mine ? "mr-7" : "mr-9")}
      title={`${quoteAuthor(quote, bot, bots)}: ${quote.text || "A file"}`}
    >
      <span
        aria-hidden
        className="w-0.5 shrink-0 self-stretch rounded-full bg-current opacity-35"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-xs leading-5 font-medium opacity-80">
          {quoteAuthor(quote, bot, bots)}
        </span>
        <span className="truncate text-xs leading-5 opacity-60">{quote.text || "A file"}</span>
      </span>
    </div>
  );
}
