import { ChevronRight } from "@mynaui/icons-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";

import { activitySummary, peerBots, peerName } from "../activity";
import type { Bot, BotChatMessage } from "../types";
import { BotAvatar } from "./bot-avatar";

// Who wrote a message to whom, by the names the bots have now.
function route(message: BotChatMessage, self: Pick<Bot, "name">, bots: readonly Bot[]) {
  const { peer } = message;
  if (!peer) return "";
  const other = peerName(peer, bots);
  return peer.direction === "to" ? `${self.name} → ${other}` : `${other} → ${self.name}`;
}

// Messages between this bot and others as one line that opens, as in the Anvia harness (decision
// 0063): Messaged, Heard from, or how many messages with whom; open, each message with who wrote it
// to whom.
export function BotActivity({
  messages,
  bots,
  self,
}: {
  messages: readonly BotChatMessage[];
  bots: readonly Bot[];
  self: Pick<Bot, "name">;
}) {
  const { lead, peers } = activitySummary(messages);
  const others = peerBots(peers, bots);
  return (
    <Collapsible className="my-3 w-full" data-activity="bots">
      <CollapsibleTrigger className="group mx-auto flex items-center gap-2 rounded py-1 text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <span>{lead}</span>
        <span className="flex items-center">
          {others.slice(0, 3).map((bot) => (
            <BotAvatar key={bot.id} bot={bot} className="-ml-1.5 size-5 first:ml-0" />
          ))}
        </span>
        <span className="text-foreground">
          {others.length === 1 ? others[0]!.name : `${others.length} bots`}
        </span>
        <ChevronRight className="size-3 shrink-0 transition group-data-[panel-open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mx-auto mt-1 max-w-[80%] space-y-1 border-l-2 pl-3 text-xs text-muted-foreground">
        {messages.map((message) => (
          <p key={message.id} className="[overflow-wrap:anywhere] whitespace-pre-line">
            <span className="font-medium">{route(message, self, bots)}</span> {message.text}
          </p>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
