import {
  IconCircleFilled,
  IconEye,
  IconGitBranch,
  IconGitCompare,
  IconList,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { useMemo, useState } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { PanelToggle } from "@aven/ui/panel-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@aven/ui/popover";
import type { Project } from "@/modules/projects/types";

import type { GitCenterMode, GitCenterModeReason } from "../types";

type Props = {
  projects: Project[];
  activeProjectId: string;
  tabIds: string[];
  mode: GitCenterMode;
  modeReason: GitCenterModeReason;
  refsOpen?: boolean;
  inspectorOpen?: boolean;
  onToggleRefs?: () => void;
  onToggleInspector?: () => void;
  onSelectProject: (projectId: string) => void;
  onCloseTab: (projectId: string) => void;
};

const REASON_LABEL: Record<GitCenterModeReason, string> = {
  ok: "Live Runner",
  runner_offline: "Read-only · Runner offline",
  runner_outdated: "Read-only · Update runner",
  github_only: "Read-only · GitHub",
  not_a_repo: "Not a git repo",
};

export function GitTabBar({
  projects,
  activeProjectId,
  tabIds,
  mode,
  modeReason,
  refsOpen = true,
  inspectorOpen = true,
  onToggleRefs,
  onToggleInspector,
  onSelectProject,
  onCloseTab,
}: Props) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const tabs = useMemo(() => {
    const ordered = tabIds.includes(activeProjectId) ? tabIds : [...tabIds, activeProjectId];
    return ordered.flatMap((id) => {
      const p = projectMap.get(id);
      return p ? [p] : [];
    });
  }, [activeProjectId, projectMap, tabIds]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return projects;

    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.repoFullName ?? "").toLowerCase().includes(q),
    );
  }, [projects, query]);

  const handleClose = (projectId: string) => {
    onCloseTab(projectId);

    if (projectId === activeProjectId) {
      const remaining = tabs.filter((t) => t.id !== projectId);

      if (remaining[0]) {
        void navigate({ to: "/git/$projectId", params: { projectId: remaining[0].id } });
      }
    }
  };

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 bg-background px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((project) => {
          const active = project.id === activeProjectId;
          return (
            <div
              key={project.id}
              className={cn(
                "group flex h-7 max-w-52 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
                active
                  ? "border-border/80 bg-background font-medium text-foreground shadow-2xs"
                  : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Button
                variant="ghost"
                size="xs"
                className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-0 hover:bg-transparent"
                onClick={() => onSelectProject(project.id)}
              >
                <IconGitBranch
                  className={cn(
                    "size-3.5 shrink-0",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="truncate">{project.name}</span>
              </Button>
              {tabs.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Close ${project.name} tab`}
                  className="size-4 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleClose(project.id)}
                >
                  <IconX className="size-3" />
                </Button>
              )}
            </div>
          );
        })}

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Open repository tab"
                title="Open repository tab"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              />
            }
          >
            <IconPlus className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Switch or open project…"
              className="mb-2 h-8 text-xs"
            />
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {filteredProjects.map((project) => (
                <Button
                  key={project.id}
                  variant="ghost"
                  size="sm"
                  className="h-auto justify-start gap-2 px-2 py-1.5 text-left"
                  onClick={() => {
                    setPickerOpen(false);
                    setQuery("");
                    onSelectProject(project.id);
                  }}
                >
                  <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{project.name}</div>
                    {project.repoFullName && (
                      <div className="truncate font-mono text-[0.6875rem] text-muted-foreground">
                        {project.repoFullName}
                      </div>
                    )}
                  </div>
                </Button>
              ))}
              {filteredProjects.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No matching projects
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Badge
          variant={mode === "live" ? "secondary" : "outline"}
          className="h-6 shrink-0 gap-1.5 px-2 text-[0.6875rem] font-normal"
        >
          {mode === "live" ? (
            <IconCircleFilled className="size-2 text-success" />
          ) : (
            <IconEye className="size-3 text-muted-foreground" />
          )}
          <span>{REASON_LABEL[modeReason]}</span>
        </Badge>

        {(onToggleRefs || onToggleInspector) && (
          <div
            role="group"
            aria-label="Panels"
            className="hidden items-center gap-0.5 rounded-full bg-muted/50 p-0.5 lg:flex"
          >
            {onToggleRefs && (
              <PanelToggle
                label="Branches & refs"
                icon={IconList}
                open={refsOpen}
                onToggle={onToggleRefs}
              />
            )}
            {onToggleInspector && (
              <PanelToggle
                label="Inspector"
                icon={IconGitCompare}
                open={inspectorOpen}
                onToggle={onToggleInspector}
              />
            )}
          </div>
        )}
      </div>
    </header>
  );
}
