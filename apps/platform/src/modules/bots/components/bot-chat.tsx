import { cn } from "cn";
import { useMemo } from "react";

import { Message } from "@/components/message";
import { useScrollToBottom } from "@/modules/threads/hooks/use-scroll-to-bottom";

import { chatItems } from "../activity";
import { isOpen } from "../questions";
import { useBotChat } from "../hooks/use-bot-chat";
import { useBots } from "../hooks/use-bots";
import type { Bot, BotChatMessage } from "../types";
import { BotComposer } from "./bot-composer";
import { BotActivity } from "./bot-activity";
import { BotAvatar } from "./bot-avatar";
import { BotChatBubble, isPersons } from "./bot-chat-bubble";
import { BotQuestionForm } from "./bot-question-form";
import { ProviderKeyForm } from "./provider-key-form";

export function BotChat({ bot }: { bot: Bot }) {
  const { messages, typing, error, send } = useBotChat(bot.id);
  const { bots } = useBots();
  const items = useMemo(() => chatItems(messages), [messages]);
  const scroll = useScrollToBottom(messages.length + (typing ? 1 : 0));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scroll} className="h-full overflow-y-auto">
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
              const together = before?.type === "message" && before.message.role === message.role;
              return (
                <Message
                  key={item.key}
                  align={isPersons(message) ? "end" : "start"}
                  className={cn(index > 0 && (together ? "mt-1.5" : "mt-5"))}
                >
                  {isOpen(messages, message) && message.questions ? (
                    <BotAsks botName={bot.name} questions={message.questions} send={send} />
                  ) : (
                    <BotChatBubble botId={bot.id} message={message} bots={bots} />
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

function BotAsks({
  botName,
  questions,
  send,
}: {
  botName: string;
  questions: NonNullable<BotChatMessage["questions"]>;
  send: (text: string) => Promise<boolean>;
}) {
  const providerKey = questions[0]?.providerKey;
  if (providerKey) return <ProviderKeyForm botName={botName} ask={providerKey} onSaved={send} />;
  return <BotQuestionForm botName={botName} questions={questions} onSubmit={send} />;
}

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
