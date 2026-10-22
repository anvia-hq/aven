import { useScrollToBottom } from "../hooks/use-scroll-to-bottom";
import type { Message } from "../types";
import { ThreadMessage } from "./thread-message";

export function ThreadMessages({ messages }: { messages: Message[] }) {
  const bottomRef = useScrollToBottom(messages);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {messages.length === 0 && <p className="text-sm text-muted-foreground">Starting thread…</p>}
        {messages.map((message) => (
          <ThreadMessage key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
