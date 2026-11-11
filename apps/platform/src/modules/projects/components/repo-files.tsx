import { ChevronRight, ExternalLink, File, Folder } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";

import { useProjectFolder } from "../hooks/use-project-folder";
import { blobUrl } from "../repo-links";
import type { Project, RepoEntry } from "../types";

type Props = { project: Project; path: string };

const rowClass = "flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50";

function Trail({ project, path }: Props) {
  const parts = path === "" ? [] : path.split("/");
  return (
    <nav aria-label="Folder" className="flex min-w-0 items-center gap-1 text-sm">
      <Link
        to="/projects/$projectId"
        params={{ projectId: project.id }}
        className="font-medium hover:underline"
      >
        {project.name}
      </Link>
      {parts.map((part, index) => (
        <span key={parts.slice(0, index + 1).join("/")} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          {index === parts.length - 1 ? (
            <span className="truncate">{part}</span>
          ) : (
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              search={{ path: parts.slice(0, index + 1).join("/") }}
              className="truncate hover:underline"
            >
              {part}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function Entry({ project, entry }: { project: Project; entry: RepoEntry }) {
  if (entry.type === "directory") {
    return (
      <Link
        to="/projects/$projectId"
        params={{ projectId: project.id }}
        search={{ path: entry.path }}
        className={rowClass}
      >
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{entry.name}</span>
      </Link>
    );
  }
  if (!project.repoFullName) {
    return (
      <div className={rowClass}>
        <File className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      </div>
    );
  }
  return (
    <a
      href={blobUrl(project.repoFullName ?? "", project.defaultBranch ?? "main", entry.path)}
      target="_blank"
      rel="noreferrer noopener"
      className={`${rowClass} group/file`}
    >
      <File className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/file:opacity-100" />
    </a>
  );
}

export function RepoFiles({ project, path }: Props) {
  const { entries, problem, loading } = useProjectFolder(project.id, path);
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  return (
    <SectionCard title={<Trail project={project} path={path} />} label="Files">
      {loading && (
        <div className="flex flex-col gap-2 p-4" aria-busy>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      )}
      {problem !== undefined && (
        <p className="p-4 text-sm text-muted-foreground">
          {project.repoFullName
            ? "Could not read this repository on GitHub. It may be empty, or the app may no longer see it. "
            : "Could not read this folder on its computer. "}
          {problem}
        </p>
      )}
      {entries && (
        <div className="flex flex-col divide-y">
          {path !== "" && (
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              search={parent === "" ? {} : { path: parent }}
              className={rowClass}
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span>..</span>
            </Link>
          )}
          {entries.map((entry) => (
            <Entry key={entry.path} project={project} entry={entry} />
          ))}
          {entries.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">This folder is empty.</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
