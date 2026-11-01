import { cn } from "cn";
import { useMemo } from "react";

import { Message } from "@/components/message";
import { useScrollToBottom } from "@/modules/threads/hooks/use-scroll-to-bottom";

import { chatItems } from "../activity";
import { useBotChat } from "../hooks/use-bot-chat";
import { useBots } from "../hooks/use-bots";
import type { Bot } from "../types";
import { BotComposer } from "./bot-composer";
import { BotActivity } from "./bot-activity";
import { BotAvatar } from "./bot-avatar";
import { BotChatBubble, isPersons } from "./bot-chat-bubble";
import { BotQuestionForm } from "./bot-question-form";

// A bot's chat: what was said, the bot "typing" while it works, and the composer. Several messages
// from the bot arrive one after another, each as the bot sends it, close together; a change of
// speaker leaves more room.
export function BotChat({ bot }: { bot: Bot }) {
  const { messages, typing, error, send } = useBotChat(bot.id);
  const { bots } = useBots();
  const items = useMemo(() => chatItems(messages), [messages]);
  const scroll = useScrollToBottom(messages.length + (typing ? 1 : 0));
  // A question is open until anything follows it: the person's answer, or whatever else they say.
  const open = (index: number) => index === items.length - 1 && !typing;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            {items.map((item, index) => {
              if (item.type === "activity") {
                return (
                  <BotActivity key={item.key} messages={item.messages} bots={bots} self={bot} />
                );
              }
              const { message } = item;
              const before = items[index - 1];
              // Close to the message before it when the same one said it, and apart otherwise.
              const together = before?.type === "message" && before.message.role === message.role;
              return (
                <Message
                  key={item.key}
                  align={isPersons(message) ? "end" : "start"}
                  className={cn(index > 0 && (together ? "mt-1.5" : "mt-5"))}
                >
                  {message.questions && open(index) ? (
                    <BotQuestionForm
                      botName={bot.name}
                      questions={message.questions}
                      onSubmit={send}
                    />
                  ) : (
                    <BotChatBubble message={message} bots={bots} />
                  )}
                </Message>
              );
            })}
            {typing && <TypingIndicator bot={bot} />}
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
            <BotComposer
              botId={bot.id}
              main={bot.isMain}
              onSend={send}
              placeholder={`Message ${bot.name}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// The bot at work, as in the Anvia harness: its avatar with open eyes, and a line saying so.
function TypingIndicator({ bot }: { bot: Bot }) {
  return (
    <p
      role="status"
      aria-label={`${bot.name} is typing`}
      className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground"
    >
      <BotAvatar bot={bot} mood="working" className="size-6" />
      {bot.name} is typing…
    </p>
  );
}
