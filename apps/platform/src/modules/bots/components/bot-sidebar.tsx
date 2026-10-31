import { Link, useRouterState } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";
import { useBots } from "../hooks/use-bots";
import { BotAvatar } from "./bot-avatar";

// The bot's own sidebar: each bot with its avatar, its name and what it said last.
export function BotSidebar() {
  const { bots } = useBots();
  const lastMessages = useAtomValue(botLastMessagesAtom);
  const active = useRouterState({ select: (state) => state.location.pathname.startsWith("/bot") });

  return (
    <>
      <div className="px-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        Bots
      </div>
      <SidebarMenu className="px-2">
        {bots.map((bot) => (
          <SidebarMenuItem key={bot.id}>
            <SidebarMenuButton
              render={<Link to="/bot" />}
              isActive={active && bot.isMain}
              size="lg"
              tooltip={bot.name}
            >
              <BotAvatar bot={bot} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-medium">{bot.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {lastMessages[bot.id] || "No messages yet"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </>
  );
}
