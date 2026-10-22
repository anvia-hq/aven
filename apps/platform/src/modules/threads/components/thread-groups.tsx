import { ChevronRight, Spinner } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";

import { useThreads } from "../hooks/use-threads";
import type { Thread } from "../types";

const DAY_MS = 86_400_000;

type Group = { id: string; label: string; threads: Thread[]; defaultOpen: boolean };

export function ThreadGroups() {
  const byRecent = useThreads();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const cutoff = Date.now() - DAY_MS;
  const open = byRecent.filter((thread) => thread.state === "open");

  const groups: Group[] = [
    {
      id: "recent",
      label: "Recent",
      threads: open.filter((thread) => new Date(thread.updatedAt).getTime() >= cutoff),
      defaultOpen: true,
    },
    {
      id: "earlier",
      label: "Earlier",
      threads: open.filter((thread) => new Date(thread.updatedAt).getTime() < cutoff),
      defaultOpen: true,
    },
    {
      id: "snoozed",
      label: "Snoozed",
      threads: byRecent.filter((thread) => thread.state === "snoozed"),
      defaultOpen: false,
    },
    {
      id: "archived",
      label: "Archived",
      threads: byRecent.filter((thread) => thread.state === "archived"),
      defaultOpen: false,
    },
  ];

  return (
    <div className="flex flex-col gap-1 px-2 group-data-[collapsible=icon]:hidden">
      {groups.map((group) => (
        <Collapsible key={group.id} defaultOpen={group.defaultOpen} data-group={group.id}>
          <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-data-panel-open/trigger:rotate-90" />
            <span>{group.label}</span>
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-xs">{group.threads.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenu>
              {group.threads.map((thread) => (
                <SidebarMenuItem key={thread.id}>
                  <SidebarMenuButton
                    render={<Link to="/threads/$threadId" params={{ threadId: thread.id }} />}
                    isActive={pathname === `/threads/${thread.id}`}
                  >
                    <span className="flex-1 truncate">{thread.title}</span>
                    {thread.status === "running" && <Spinner className="animate-spin" />}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {group.threads.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Nothing here.</p>
              )}
            </SidebarMenu>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
