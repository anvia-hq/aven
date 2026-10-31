import { ArrowUp } from "@mynaui/icons-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Textarea } from "@/components/textarea";

type Props = {
  /** Resolves to whether the message was taken; the text is only cleared when it was. */
  onSend: (text: string) => Promise<boolean>;
  placeholder: string;
};

// Where the person writes to a bot. Enter sends, Shift+Enter starts a new line. The bot may be
// at work: a message sent meanwhile waits its turn, so the composer is never locked.
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
    <div className="flex items-end gap-2 border-t p-3">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Message"
        rows={1}
        className="max-h-40 min-h-9 flex-1 resize-none"
      />
      <Button size="icon" aria-label="Send" disabled={!text.trim()} onClick={() => void submit()}>
        <ArrowUp />
      </Button>
    </div>
  );
}
