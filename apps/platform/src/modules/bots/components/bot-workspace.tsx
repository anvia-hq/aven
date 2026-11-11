import { useMediaQuery } from "@/hooks/use-media-query";
import { useDefaultTimezone } from "@/modules/settings/hooks/use-timezone";

import type { Bot } from "../types";
import { BotChat } from "./bot-chat";
import { BotHeader } from "./bot-header";

export function BotWorkspace({ bot }: { bot: Bot }) {
  useMediaQuery("(min-width: 1024px)");
  useDefaultTimezone();

  return (
    <div className="flex h-[calc(100svh-var(--mobile-chrome))] min-w-0 flex-col md:h-[calc(100svh-1rem)]">
      <div className="@container flex min-h-0 flex-1 flex-col overflow-clip bg-background md:rounded-r-xl md:border-y md:border-r md:border-sidebar-border">
        <BotHeader bot={bot} />
        <BotChat bot={bot} />
      </div>
    </div>
  );
}
