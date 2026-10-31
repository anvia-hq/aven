import { Star } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

import { AvatarBadge } from "@/components/avatar";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";
import { useBots } from "../hooks/use-bots";
import { BotAvatar } from "./bot-avatar";
import { BotSettingsDialog } from "./bot-settings-dialog";

// The bot's own sidebar: the main bot as a tile on top, and under it the person's other bots, each
// with its avatar, its name and what it said last, or what it is for until it has said anything.
export function BotSidebar() {
  const { bots, main } = useBots();
  const lastMessages = useAtomValue(botLastMessagesAtom);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const others = bots.filter((bot) => !bot.isMain);

  return (
    <>
      {main && (
        <div className="group/tile relative mx-auto mt-2 mb-3">
          <Link
            to="/bot"
            aria-label={`${main.name}, main bot`}
            className="flex w-28 flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-xs text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-sidebar-accent group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:p-1"
            data-active={pathname === "/bot" || pathname === "/bot/"}
          >
            <BotAvatar
              bot={main}
              className="size-16 text-3xl group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:text-sm"
            >
              <AvatarBadge className="size-5! [&>svg]:size-3!">
                <Star />
              </AvatarBadge>
            </BotAvatar>
            <span className="max-w-full truncate group-data-[collapsible=icon]:hidden">
              {main.name}
            </span>
          </Link>
          <div className="absolute top-1 right-1 opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 pointer-coarse:opacity-100 group-data-[collapsible=icon]:hidden">
            <BotSettingsDialog bot={main} />
          </div>
        </div>
      )}
      <SidebarMenu className="gap-2 px-2">
        {others.map((bot) => (
          <SidebarMenuItem key={bot.id}>
            <SidebarMenuButton
              render={<Link to="/bot/$botId" params={{ botId: bot.id }} />}
              isActive={pathname === `/bot/${bot.id}`}
              size="lg"
              tooltip={bot.name}
              className="gap-3"
            >
              <BotAvatar bot={bot} className="size-10" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-medium">{bot.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {lastMessages[bot.id] || bot.description || "No messages yet"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </>
  );
}
