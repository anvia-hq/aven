import { useRouterState } from "@tanstack/react-router";
import { useLayoutEffect } from "react";

import { BotSidebar } from "@/modules/bots/components/bot-sidebar";
import { CockpitSidebar } from "@/modules/cockpit/components/cockpit-sidebar";
import { SettingsSidebar } from "@/modules/settings/components/settings-sidebar";
import { SidebarThreads } from "@/modules/threads/components/sidebar-threads";

import { SidebarTabs } from "./sidebar-tabs";

type Section = "threads" | "settings" | "bot" | "cockpit";

function sectionOf(pathname: string): Section {
  if (pathname.startsWith("/settings")) return "settings";

  if (pathname.startsWith("/bot")) return "bot";

  if (pathname.startsWith("/cockpit")) return "cockpit";

  return "threads";
}

export function ShellSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const section = sectionOf(pathname);

  useLayoutEffect(() => {
    const content = document.querySelector("[data-slot=sidebar-content]");

    if (content) content.scrollTop = 0;
  }, [section]);

  if (section === "settings") return <SettingsSidebar />;

  if (section === "bot") return <BotSidebar />;

  if (section === "cockpit") return <CockpitSidebar />;

  return (
    <>
      <SidebarTabs />
      <SidebarThreads />
    </>
  );
}
