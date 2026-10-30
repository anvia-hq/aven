import { useScrollToBottom } from "../hooks/use-scroll-to-bottom";
import type { ChatMessage } from "../types";
import { ThreadMessage } from "./thread-message";

export function ThreadMessages({
  messages,
  error,
}: {
  messages: ChatMessage[];
  error?: string | null;
}) {
  const bottomRef = useScrollToBottom(messages);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-5 pb-48">
        {messages.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">Send a message to start.</p>
        )}
        {messages.map((message) => (
          <ThreadMessage key={message.id} message={message} />
        ))}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
