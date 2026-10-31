import { cn } from "cn";

import { Bubble, BubbleContent } from "@/components/bubble";
import { Markdown } from "@/components/markdown";
import { Message, MessageContent } from "@/components/message";
import { useScrollToBottom } from "@/modules/threads/hooks/use-scroll-to-bottom";

import { useBotChat } from "../hooks/use-bot-chat";
import type { Bot } from "../types";
import { BotComposer } from "./bot-composer";

// A bot's chat: what was said, the bot "typing" while it works, and the composer. Several messages
// from the bot arrive one after another, each as the bot sends it, close together; a change of
// speaker leaves more room.
export function BotChat({ bot }: { bot: Bot }) {
  const { messages, typing, error, send } = useBotChat(bot.id);
  const scroll = useScrollToBottom(messages.length + (typing ? 1 : 0));

  return (
    <div className="flex h-[calc(100svh-2.5rem)] min-w-0 flex-col md:h-[calc(100svh-1rem-2px)]">
      {/* As in a thread: the conversation scrolls the full height, behind the composer. */}
      <div className="relative min-h-0 flex-1">
        <div ref={scroll} className="h-full overflow-y-auto">
          {/* The bottom padding clears the composer. */}
          <div className="mx-auto flex max-w-4xl flex-col px-4 pt-6 pb-48">
            {messages.length === 0 && !typing && (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Say hello to {bot.name}.
              </p>
            )}
            {messages.map((message, index) => {
              const mine = message.role === "user";
              const sameSpeaker = messages[index - 1]?.role === message.role;
              return (
                <Message
                  key={message.id}
                  align={mine ? "end" : "start"}
                  className={cn(index > 0 && (sameSpeaker ? "mt-1.5" : "mt-5"))}
                >
                  <MessageContent>
                    <Bubble variant={mine ? "tinted" : "muted"} align={mine ? "end" : "start"}>
                      <BubbleContent className="rounded-2xl">
                        {mine ? (
                          <span className="whitespace-pre-wrap">{message.text}</span>
                        ) : (
                          <Markdown>{message.text}</Markdown>
                        )}
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              );
            })}
            {typing && <TypingIndicator name={bot.name} />}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive"
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
    <div
      role="status"
      aria-label={`${name} is typing`}
      className="mt-1.5 flex w-fit items-center gap-1 rounded-2xl bg-muted px-4 py-3.5"
    >
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
