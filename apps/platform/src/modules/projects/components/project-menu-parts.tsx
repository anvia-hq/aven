import { IconFolder } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Button } from "@aven/ui/button";
import { Skeleton } from "@aven/ui/skeleton";
import { GithubMark } from "@/components/brand-icons";

import { projectPlace } from "../place";
import type { Project } from "../types";

export const matchesProjectQuery = (query: string, ...parts: string[]) =>
  parts.join(" ").toLowerCase().includes(query.trim().toLowerCase());

export function ProjectRows({
  label,
  projects,
  value,
  onPick,
}: {
  label: string;
  projects: Project[];
  value: string | undefined;
  onPick: (projectId: string) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <MenuGroup label={label}>
      {projects.map((project) => (
        <MenuRow
          key={project.id}
          pressed={project.id === value}
          icon={project.repoFullName ? <GithubMark className="size-4" /> : <IconFolder />}
          label={project.name}
          detail={projectPlace(project)}
          onClick={() => onPick(project.id)}
        />
      ))}
    </MenuGroup>
  );
}

export function MenuNote({ children }: { children: ReactNode }) {
  return <p className="px-2 py-3 text-sm text-muted-foreground">{children}</p>;
}

export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function MenuRow({
  icon,
  label,
  detail,
  pressed,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={pressed}
      disabled={disabled}
      className="h-8 w-full justify-start gap-2 px-2 font-normal hover:bg-accent! aria-pressed:bg-accent"
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="max-w-32 truncate text-xs text-muted-foreground">{detail}</span>
    </Button>
  );
}

export function MenuSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2" aria-busy="true">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}
