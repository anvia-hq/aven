import { useRouterState } from "@tanstack/react-router";
import { useLayoutEffect } from "react";

import { AutomationsSidebar } from "@/modules/automations/components/automations-sidebar";
import { BotSidebar } from "@/modules/bots/components/bot-sidebar";
import { CockpitSidebar } from "@/modules/cockpit/components/cockpit-sidebar";
import { GitShellSidebar } from "@/modules/git-center/components/git-shell-sidebar";
import { ProjectsSidebar } from "@/modules/projects/components/projects-sidebar";
import { SettingsSidebar } from "@/modules/settings/components/settings-sidebar";
import { SidebarThreads } from "@/modules/threads/components/sidebar-threads";
import { useRunningThreadsPoll } from "@/modules/threads/hooks/use-running-threads-poll";
import { useThreads } from "@/modules/threads/hooks/use-threads";

type Section = "threads" | "projects" | "automations" | "settings" | "bot" | "cockpit" | "git";

function sectionOf(pathname: string): Section {
  if (pathname.startsWith("/projects")) return "projects";

  if (pathname.startsWith("/automations")) return "automations";

  if (pathname.startsWith("/settings")) return "settings";

  if (pathname.startsWith("/bot")) return "bot";

  if (pathname.startsWith("/cockpit")) return "cockpit";

  if (pathname.startsWith("/git")) return "git";

  return "threads";
}

export function ShellSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const section = sectionOf(pathname);
  const { all, refresh } = useThreads();
  useRunningThreadsPoll(
    all.some((thread) => thread.running),
    refresh,
  );

  useLayoutEffect(() => {
    const content = document.querySelector("[data-slot=sidebar-content]");

    if (content) content.scrollTop = 0;
  }, [section]);

  if (section === "projects") return <ProjectsSidebar />;

  if (section === "automations") return <AutomationsSidebar />;

  if (section === "settings") return <SettingsSidebar />;

  if (section === "bot") return <BotSidebar />;

  if (section === "cockpit") return <CockpitSidebar />;

  if (section === "git") return <GitShellSidebar />;

  return (
    <>
      <SidebarThreads />
    </>
  );
}
