import { ArrowUp } from "@mynaui/icons-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Textarea } from "@/components/textarea";

type Props = {
  /** Resolves to whether the message was taken; the text is only cleared when it was. */
  onSend: (text: string) => Promise<boolean>;
  placeholder: string;
};

// Where the person writes to a bot: a pill with the text and Send in it, growing with what is
// written. Enter sends, Shift+Enter starts a new line. The bot may be at work: a message sent
// meanwhile waits its turn, so the composer is never locked.
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
    <div className="relative flex items-end gap-2 rounded-3xl border bg-card py-2 pr-2 pl-4 focus-within:border-ring">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Message"
        rows={1}
        className="max-h-48 min-h-9 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-1.5 text-sm leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        size="icon"
        className="rounded-full"
        aria-label="Send"
        disabled={!text.trim()}
        onClick={() => void submit()}
      >
        <ArrowUp />
      </Button>
    </div>
  );
}
