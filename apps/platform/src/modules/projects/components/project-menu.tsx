import { IconFolder, IconGitBranch, IconSearch } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@aven/ui/popover";
import type { Runtime } from "@/modules/runtimes/types";
import type { Thread } from "@/modules/threads/types";

import { projectPlace } from "../place";
import { projectFits } from "../project-fits";
import { recentProjects } from "../recent-projects";
import type { GithubRepository, Project } from "../types";
import { AddProjectDialog } from "./add-project-dialog";
import { ProjectMenuFolders } from "./project-menu-folders";
import { matchesProjectQuery, ProjectRows } from "./project-menu-parts";
import { ProjectMenuRepositories } from "./project-menu-repositories";

type Props = {
  runtime: Runtime | undefined;
  projects: Project[];
  threads: Thread[];
  value: string | undefined;
  adding: boolean;
  onPick: (projectId: string) => void;
  onAddFolder: (path: string) => void;
  onAddRepository: (installationId: string, repository: GithubRepository) => void;
};

const PLACEHOLDER = "Add a project";

export function ProjectMenu({
  runtime,
  projects,
  threads,
  value,
  adding,
  onPick,
  onAddFolder,
  onAddRepository,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const sandbox = runtime?.isCloud === true;
  const chosen = projects.find((project) => project.id === value);
  const recent = recentProjects(projects, threads).filter(
    (project) =>
      projectFits(project, runtime) &&
      matchesProjectQuery(query, project.name, projectPlace(project)),
  );

  function choose(projectId: string) {
    setOpen(false);
    onPick(projectId);
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);

          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label="Project"
              aria-expanded={open}
              className="border-transparent bg-muted/40 dark:border-transparent dark:bg-muted/40 max-w-48 min-w-0 rounded-full px-3 text-muted-foreground"
            />
          }
        >
          {sandbox ? <IconGitBranch /> : <IconFolder />}
          <span className="truncate">{chosen?.name ?? PLACEHOLDER}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-0 p-0">
          <div className="border-b p-2">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={sandbox ? "Search repositories" : "Search folders"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={sandbox ? "Search repositories" : "Search folders"}
                className="pl-8 focus-visible:ring-0!"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            <ProjectRows label="Recent" projects={recent} value={value} onPick={choose} />
            {sandbox ? (
              <ProjectMenuRepositories
                query={query}
                projects={projects}
                value={value}
                adding={adding}
                onPick={choose}
                onNew={() => {
                  setOpen(false);
                  setCreating(true);
                }}
                onAdd={(installationId, repository) => {
                  setOpen(false);
                  onAddRepository(installationId, repository);
                }}
              />
            ) : (
              <ProjectMenuFolders
                runtime={runtime}
                query={query}
                projects={projects}
                adding={adding}
                onPick={choose}
                onAdd={(path) => {
                  setOpen(false);
                  onAddFolder(path);
                }}
              />
            )}
            {!sandbox && (
              <ProjectRows
                label="Repositories"
                projects={projects.filter(
                  (project) =>
                    project.repoFullName !== null &&
                    !recent.some((shown) => shown.id === project.id) &&
                    matchesProjectQuery(query, project.name, projectPlace(project)),
                )}
                value={value}
                onPick={choose}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
      {creating && (
        <AddProjectDialog
          open={creating}
          onOpenChange={setCreating}
          onAdded={(project) => onPick(project.id)}
        />
      )}
    </>
  );
}
