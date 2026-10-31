import type { ReactNode } from "react";

import { Bubble, BubbleContent } from "@/components/bubble";
import { Message, MessageAvatar, MessageContent } from "@/components/message";
import { useScrollToBottom } from "@/modules/threads/hooks/use-scroll-to-bottom";

import { useBotChat } from "../hooks/use-bot-chat";
import type { Bot } from "../types";
import { BotAvatar } from "./bot-avatar";
import { BotComposer } from "./bot-composer";

// A bot's chat: what was said, the bot "typing" while it works, and the composer. Several messages
// from the bot arrive one after another, each as the bot sends it.
export function BotChat({ bot, actions }: { bot: Bot; actions?: ReactNode }) {
  const { messages, typing, error, send } = useBotChat(bot.id);
  const scroll = useScrollToBottom(messages.length + (typing ? 1 : 0));

  return (
    <div className="flex h-[calc(100svh-2.5rem)] min-w-0 flex-col md:h-[calc(100svh-1rem-2px)]">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <BotAvatar bot={bot} size="sm" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{bot.name}</h1>
        {actions}
      </header>

      {/* As in a thread: the conversation scrolls the full height, behind the composer. */}
      <div className="relative min-h-0 flex-1">
        <div ref={scroll} className="h-full overflow-y-auto">
          {/* The bottom padding clears the composer. */}
          <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 pt-5 pb-48">
            {messages.length === 0 && !typing && (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Say hello to {bot.name}.
              </p>
            )}
            {messages.map((message) => {
              const mine = message.role === "user";
              return (
                <Message key={message.id} align={mine ? "end" : "start"}>
                  {!mine && (
                    <MessageAvatar>
                      <BotAvatar bot={bot} size="sm" />
                    </MessageAvatar>
                  )}
                  <MessageContent>
                    <Bubble variant={mine ? "default" : "muted"} align={mine ? "end" : "start"}>
                      <BubbleContent className="whitespace-pre-wrap">{message.text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              );
            })}
            {typing && <TypingIndicator name={bot.name} />}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background from-60% to-transparent pt-8 pr-3">
          <div className="pointer-events-auto mx-auto w-full max-w-4xl px-4 pb-6">
            <BotComposer onSend={send} placeholder={`Message ${bot.name}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator({ name }: { name: string }) {
  return (
    <div role="status" aria-label={`${name} is typing`} className="flex items-center gap-1 pl-13">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
