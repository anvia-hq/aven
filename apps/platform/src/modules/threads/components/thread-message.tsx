import { Fragment } from "react";

import type { ChatMessage } from "../types";
import { ToolCall } from "./tool-call";

// Tiny inline renderer for `code` and **bold**.
function InlineText({ text }: { text: string }) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {tokens.map((token, index) => {
        if (token.startsWith("`")) {
          return (
            <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              {token.slice(1, -1)}
            </code>
          );
        }
        if (token.startsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
        return <Fragment key={index}>{token}</Fragment>;
      })}
    </>
  );
}

export function ThreadMessage({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm leading-6" data-role="user">
        {message.parts.map((part, index) =>
          part.type === "text" ? <InlineText key={index} text={part.text} /> : null,
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-role="assistant">
      {message.parts.map((part, index) =>
        part.type === "text" ? (
          <p key={index} className="text-sm leading-6">
            <InlineText text={part.text} />
          </p>
        ) : (
          <ToolCall key={part.tool.id} tool={part.tool} />
        ),
      )}
      {message.parts.length === 0 && <p className="text-sm text-muted-foreground">Thinking…</p>}
    </div>
  );
}
