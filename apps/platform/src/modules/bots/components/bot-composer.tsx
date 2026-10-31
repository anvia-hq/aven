import {
  ChatProvider,
  ComposerPrimitive,
  useComposer,
  type ComposerInputEntity,
} from "@anvia/react-ui/chat";
import { ArrowUp } from "@mynaui/icons-react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { MentionMenu } from "@/modules/threads/components/mention-menu";
import { useComposerChat } from "@/modules/threads/hooks/use-composer-chat";

import { useBotMentions } from "../hooks/use-bot-mentions";
import { BotMentionChip } from "./bot-mention-chip";

type Props = {
  /** The bot written to: it is not offered when the person mentions a bot. */
  botId: string;
  /** Whether it is the main bot, the only one that can write to the others and so the only one `@` is for. */
  main: boolean;
  /** Resolves to whether the message was taken; the text is only cleared when it was. */
  onSend: (text: string) => Promise<boolean>;
  placeholder: string;
};

// The avatar a mention carries, kept by the composer with the token; the shape is what `useBotMentions` put there.
function avatarOf(data: ComposerInputEntity["data"]) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "";
  const { avatar } = data as { avatar?: unknown };
  return typeof avatar === "string" ? avatar : "";
}

const renderEntity = ({ triggerId, id, label, data }: ComposerInputEntity) =>
  triggerId === "bot" ? <BotMentionChip bot={{ id, name: label, avatar: avatarOf(data) }} /> : null;

// Where the person writes to a bot: a pill with the text and Send in it, growing with what is
// written, in Anvia's tiptap composer, where `@` mentions another of their bots (decision 0063).
// Enter sends, Shift+Enter starts a new line. The bot may be at work: a message sent meanwhile
// waits its turn, so the composer is never locked.
export function BotComposer({ botId, main, ...props }: Props) {
  const chat = useComposerChat();
  const triggers = useBotMentions(botId, main);
  return (
    <ChatProvider controller={chat}>
      {/* Sending is the composer's own below; the form Anvia renders never submits. */}
      <ComposerPrimitive.Root
        triggers={triggers}
        className="contents"
        onSubmit={(event) => event.preventDefault()}
      >
        <Composer {...props} />
      </ComposerPrimitive.Root>
    </ChatProvider>
  );
}

function Composer({ onSend, placeholder }: Omit<Props, "botId" | "main">) {
  const composer = useComposer();
  const message = composer.input.trim();

  const submit = async () => {
    if (!message) return;
    if (await onSend(message)) {
      composer.setInput("");
      composer.setEntities([]);
    }
  };

  // Enter sends, unless the `@` menu has a bot to pick, which Enter then picks. Handled before the
  // editor sees it, so a message after an `@` that names no bot still sends.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (composer.activeTrigger?.items.length) return;
    event.preventDefault();
    event.stopPropagation();
    void submit();
  };

  return (
    <div
      className="relative flex items-end gap-2 rounded-3xl border bg-card py-2 pr-2 pl-4 focus-within:border-ring"
      onKeyDownCapture={onKeyDown}
    >
      <MentionMenu />
      <ComposerPrimitive.Input
        aria-label="Message"
        placeholder={placeholder}
        renderEntity={renderEntity}
        className="max-h-48 min-h-9 flex-1 overflow-y-auto py-1.5 text-sm leading-6"
      />
      <Button
        size="icon"
        className="rounded-full"
        aria-label="Send"
        disabled={!message}
        onClick={() => void submit()}
      >
        <ArrowUp />
      </Button>
    </div>
  );
}
