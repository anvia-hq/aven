import type { ComposerTriggerItem } from "@anvia/react-ui/chat";

import { BotAvatar } from "./bot-avatar";
import { ThreadMentionMark } from "./thread-mention-mark";

export function MentionIcon({ item }: { item: ComposerTriggerItem }) {
  const data = item.data as { kind?: string; avatar?: string } | undefined;

  if (data?.kind === "bot") {
    return <BotAvatar bot={{ id: item.id, avatar: data.avatar ?? "" }} className="size-5" />;
  }

  if (data?.kind === "thread") return <ThreadMentionMark id={item.id} className="size-4" />;

  return null;
}
