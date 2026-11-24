import { IconBolt, IconClock, IconPlayerPause, IconWebhook } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@aven/ui/sidebar";

import { useAutomations } from "../hooks/use-automations";
import type { Automation, AutomationFilter } from "../types";

function statusTone(automation: Automation) {
  if (!automation.enabled) return "bg-muted-foreground/40";

  if (automation.lastStatus === "failed") return "bg-destructive";

  if (automation.lastStatus === "running") return "bg-info";

  return "bg-success";
}

export function AutomationsSidebar() {
  const { automations } = useAutomations();
  const search = useRouterState({
    select: (state) => state.location.search as { filter?: AutomationFilter; selected?: string },
  });
  const activeFilter: AutomationFilter = search.filter ?? "all";
  const selectedId = search.selected;

  const scheduleCount = automations.filter((item) => item.triggerKind === "schedule").length;
  const webhookCount = automations.filter((item) => item.triggerKind === "webhook").length;
  const pausedCount = automations.filter((item) => !item.enabled).length;

  const views = [
    { id: "all" as const, label: "All", icon: IconBolt, count: automations.length },
    { id: "schedule" as const, label: "Schedules", icon: IconClock, count: scheduleCount },
    { id: "webhook" as const, label: "Webhooks", icon: IconWebhook, count: webhookCount },
    { id: "paused" as const, label: "Paused", icon: IconPlayerPause, count: pausedCount },
  ];

  return (
    <nav aria-label="Automations" className="pt-4">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="h-6 font-normal text-muted-foreground">
          Automations
        </SidebarGroupLabel>
        <SidebarMenu>
          {views.map((view) => {
            const active = !selectedId && activeFilter === view.id;
            return (
              <SidebarMenuItem key={view.id}>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/automations"
                      search={view.id === "all" ? {} : { filter: view.id }}
                      aria-current={active ? "page" : undefined}
                    />
                  }
                  isActive={active}
                  tooltip={view.label}
                >
                  <view.icon />
                  <span>{view.label}</span>
                </SidebarMenuButton>
                {view.count > 0 && <SidebarMenuBadge>{view.count}</SidebarMenuBadge>}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
      {automations.length > 0 && (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 font-normal text-muted-foreground">
            Configured
          </SidebarGroupLabel>
          <SidebarMenu aria-label="Configured automations">
            {automations.map((automation) => {
              const selected = selectedId === automation.id;
              const Icon = automation.triggerKind === "webhook" ? IconWebhook : IconClock;
              return (
                <SidebarMenuItem key={automation.id}>
                  <SidebarMenuButton
                    isActive={selected}
                    tooltip={automation.name}
                    render={
                      <Link
                        to="/automations"
                        search={selected ? {} : { selected: automation.id }}
                      />
                    }
                  >
                    <Icon />
                    <span className="min-w-0 flex-1 truncate">{automation.name}</span>
                    <span
                      aria-hidden="true"
                      className={cn("size-1.5 shrink-0 rounded-full", statusTone(automation))}
                    />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </nav>
  );
}
