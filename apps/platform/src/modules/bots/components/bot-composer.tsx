import { ArrowUp } from "@mynaui/icons-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Textarea } from "@/components/textarea";

type Props = {
  /** Resolves to whether the message was taken; the text is only cleared when it was. */
  onSend: (text: string) => Promise<boolean>;
  placeholder: string;
};

// Where the person writes to a bot, drawn like the thread's composer: a card with the text above
// and Send below. Enter sends, Shift+Enter starts a new line. The bot may be at work: a message
// sent meanwhile waits its turn, so the composer is never locked.
export function BotComposer({ onSend, placeholder }: Props) {
  const [text, setText] = useState("");

  const submit = async () => {
    const message = text.trim();
    if (!message) return;
    if (await onSend(message)) setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="relative flex flex-col rounded-lg border bg-card p-2 focus-within:border-ring">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Message"
        className="max-h-60 min-h-14 resize-none rounded-none border-0 bg-transparent p-1 text-sm leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          size="icon-sm"
          aria-label="Send"
          disabled={!text.trim()}
          onClick={() => void submit()}
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  );
}
