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

      <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-4">
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
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>

      <BotComposer onSend={send} placeholder={`Message ${bot.name}`} />
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
