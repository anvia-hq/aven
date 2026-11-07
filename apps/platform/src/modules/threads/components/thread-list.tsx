import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/badge";
import { authClient } from "@/lib/auth-client";
import { timeAgo } from "@/lib/format";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";
import { useProjects } from "@/modules/projects/hooks/use-projects";

import type { Thread } from "../types";

export function ThreadList({ threads, empty }: { threads: Thread[]; empty?: string }) {
  const { projects } = useProjects();
  const palettes = useProjectPalettes();
  const { data: session } = authClient.useSession();

  return (
    <ul className="flex flex-col gap-0.5">
      {threads.map((thread) => {
        const project = projects.find((candidate) => candidate.id === thread.projectId);
        return (
          <li key={thread.id}>
            <Link
              to="/threads/$threadId"
              params={{ threadId: thread.id }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50"
            >
              {project ? (
                <span title={project.name} className="flex shrink-0">
                  <ProjectTile projectId={project.id} palette={palettes.get(project.id)} />
                  <span className="sr-only">{project.name}</span>
                </span>
              ) : (
                <span className="size-5 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
              {thread.createdBy !== session?.user.id && (
                <span className="shrink-0 truncate text-xs text-muted-foreground">
                  {thread.createdByName}
                </span>
              )}
              {thread.state !== "open" && (
                <Badge variant="secondary" className="capitalize">
                  {thread.state}
                </Badge>
              )}
              <span className="shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground">
                {timeAgo(thread.updatedAt, true)}
              </span>
            </Link>
          </li>
        );
      })}
      {threads.length === 0 && empty && (
        <li className="p-3 text-sm text-muted-foreground">{empty}</li>
      )}
    </ul>
  );
}
