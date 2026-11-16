import { Folder, GitBranch, Search } from "@mynaui/icons-react";
import { useState, type ReactNode } from "react";

import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@aven/ui/popover";
import { GithubMark } from "@/components/brand-icons";
import { Skeleton } from "@aven/ui/skeleton";
import type { Runtime } from "@/modules/runtimes/types";
import type { Thread } from "@/modules/threads/types";

import { useFolderBrowser } from "../hooks/use-folder-browser";
import { useGithubRepositories } from "../hooks/use-github-repositories";
import { projectFits } from "../project-fits";
import { projectPlace } from "../place";
import { recentProjects } from "../recent-projects";
import type { FolderEntry, GithubRepository, Project } from "../types";

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

const matches = (query: string, ...parts: string[]) =>
  parts.join(" ").toLowerCase().includes(query.trim().toLowerCase());

const placeholder = (sandbox: boolean) => (sandbox ? "Choose a repository" : "Choose a folder");

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
  const sandbox = runtime?.isCloud === true;
  const chosen = projects.find((project) => project.id === value);
  const recent = recentProjects(projects, threads).filter(
    (project) =>
      projectFits(project, runtime) && matches(query, project.name, projectPlace(project)),
  );

  function choose(projectId: string) {
    setOpen(false);
    onPick(projectId);
  }

  return (
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
            variant="ghost"
            size="sm"
            aria-label="Project"
            aria-expanded={open}
            className="max-w-48 min-w-0 bg-muted/50 px-2 text-muted-foreground"
          />
        }
      >
        {sandbox ? <GitBranch /> : <Folder />}
        <span className="truncate">{chosen?.name ?? placeholder(sandbox)}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={sandbox ? "Search repositories" : "Search folders"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={sandbox ? "Search repositories" : "Search folders"}
              className="pl-8"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {recent.length > 0 && (
            <MenuGroup label="Recent">
              {recent.map((project) => (
                <MenuRow
                  key={project.id}
                  pressed={project.id === value}
                  icon={project.repoFullName ? <GithubMark className="size-4" /> : <Folder />}
                  label={project.name}
                  detail={projectPlace(project)}
                  onClick={() => choose(project.id)}
                />
              ))}
            </MenuGroup>
          )}
          {sandbox ? (
            <Repositories
              query={query}
              projects={projects}
              value={value}
              adding={adding}
              onPick={choose}
              onAdd={(installationId, repository) => {
                setOpen(false);
                onAddRepository(installationId, repository);
              }}
            />
          ) : (
            <Folders
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
            <Projects
              label="Repositories"
              projects={projects.filter(
                (project) =>
                  project.repoFullName !== null &&
                  !recent.some((shown) => shown.id === project.id) &&
                  matches(query, project.name, projectPlace(project)),
              )}
              value={value}
              onPick={choose}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Projects({
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
          icon={project.repoFullName ? <GithubMark className="size-4" /> : <Folder />}
          label={project.name}
          detail={projectPlace(project)}
          onClick={() => onPick(project.id)}
        />
      ))}
    </MenuGroup>
  );
}

function Repositories({
  query,
  projects,
  value,
  adding,
  onPick,
  onAdd,
}: {
  query: string;
  projects: Project[];
  value: string | undefined;
  adding: boolean;
  onPick: (projectId: string) => void;
  onAdd: (installationId: string, repository: GithubRepository) => void;
}) {
  const github = useGithubRepositories(true);
  const listed = github.repositories.filter((repository) => matches(query, repository.fullName));
  const projectOf = (fullName: string) =>
    projects.find((project) => project.repoFullName?.toLowerCase() === fullName.toLowerCase());

  const browsing = github.loaded && github.configured && github.installations.length > 0;
  const waiting = !github.loaded || (github.installation !== "" && !github.repositoriesLoaded);
  const shown = projects.filter(
    (project) =>
      project.repoFullName !== null &&
      matches(query, project.name, projectPlace(project)) &&
      !listed.some(
        (repository) => repository.fullName.toLowerCase() === project.repoFullName?.toLowerCase(),
      ),
  );

  if (waiting && shown.length === 0) return <MenuSkeleton />;

  if (!browsing && shown.length === 0) return <GithubNote />;

  return (
    <>
      <Projects label="Repositories" projects={shown} value={value} onPick={onPick} />
      {browsing && (
        <MenuGroup label="Repositories">
          {github.installations.length > 1 && (
            <div className="flex gap-1 px-1 pb-1">
              {github.installations.map((installation) => (
                <Button
                  key={installation.id}
                  type="button"
                  size="sm"
                  variant={installation.id === github.installation ? "secondary" : "ghost"}
                  onClick={() => github.chooseInstallation(installation.id)}
                >
                  {installation.accountLogin}
                </Button>
              ))}
            </div>
          )}
          {github.repositoriesError && <MenuNote>{github.repositoriesError}</MenuNote>}
          {listed.map((repository) => {
            const project = projectOf(repository.fullName);
            const name = repository.fullName.split("/")[1] ?? repository.fullName;
            return (
              <MenuRow
                key={repository.fullName}
                pressed={project?.id === value}
                icon={<GithubMark className="size-4" />}
                label={name}
                detail={repository.fullName}
                disabled={adding && !project}
                onClick={() =>
                  project ? onPick(project.id) : onAdd(github.installation, repository)
                }
              />
            );
          })}
          {listed.length === 0 && <MenuNote>No repository matches.</MenuNote>}
        </MenuGroup>
      )}
    </>
  );
}

function GithubNote() {
  const github = useGithubRepositories(true);

  if (!github.configured)
    return <MenuNote>GitHub is not set up on this control plane yet.</MenuNote>;

  return (
    <MenuNote>
      {github.installUrl ? (
        <a href={github.installUrl} className="underline">
          Install the Aven app on GitHub
        </a>
      ) : (
        "Install the Aven app on GitHub"
      )}{" "}
      to add a repository.
    </MenuNote>
  );
}

function Folders({
  runtime,
  query,
  projects,
  adding,
  onPick,
  onAdd,
}: {
  runtime: Runtime | undefined;
  query: string;
  projects: Project[];
  adding: boolean;
  onPick: (projectId: string) => void;
  onAdd: (path: string) => void;
}) {
  const [browsing, setBrowsing] = useState("");
  const { listing } = useFolderBrowser(runtime?.id ?? "", browsing, setBrowsing);
  const shown = listing?.data ?? null;
  const folders = (shown?.folders ?? []).filter((folder) =>
    matches(query, folder.name, folder.path),
  );

  if (!runtime) return <MenuNote>Choose a computer first.</MenuNote>;

  if (!runtime.online) return <MenuNote>{runtime.name} is offline.</MenuNote>;

  if (runtime.directories.length === 0)
    return (
      <MenuNote>
        {runtime.name} serves no folders. Start its runner with the folders it may use.
      </MenuNote>
    );

  return (
    <MenuGroup label="Folders">
      <div className="flex items-center gap-1 px-1 pb-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!browsing}
          onClick={() => setBrowsing(shown?.parent ?? "")}
        >
          Up
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {browsing || "Folders this computer serves"}
        </span>
      </div>
      {listing?.error && <MenuNote>{listing.error}</MenuNote>}
      {!shown && !listing?.error && <MenuSkeleton />}
      {folders.map((folder) => {
        const project = projects.find(
          (entry) => entry.runtimeId === runtime.id && entry.directory === folder.path,
        );
        return (
          <FolderRow
            key={folder.path}
            folder={folder}
            project={project}
            disabled={adding && !project}
            onOpen={() => (project ? onPick(project.id) : setBrowsing(folder.path))}
            onAdd={() => (project ? onPick(project.id) : onAdd(folder.path))}
          />
        );
      })}
      {shown && folders.length === 0 && <MenuNote>No folder matches.</MenuNote>}
    </MenuGroup>
  );
}

function FolderRow({
  folder,
  project,
  disabled,
  onOpen,
  onAdd,
}: {
  folder: FolderEntry;
  project: Project | undefined;
  disabled: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md pr-1 hover:bg-accent">
      <Button
        type="button"
        variant="ghost"
        aria-pressed={Boolean(project)}
        className="h-8 min-w-0 flex-1 justify-start px-2 font-normal"
        onClick={onOpen}
      >
        <Folder className="text-muted-foreground" />
        <span className="truncate">{folder.name}</span>
        {folder.git && <GitBranch className="size-3.5 text-muted-foreground" />}
      </Button>
      {!project && (
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onAdd}>
          Add
        </Button>
      )}
    </div>
  );
}

function MenuNote({ children }: { children: ReactNode }) {
  return <p className="px-2 py-3 text-sm text-muted-foreground">{children}</p>;
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function MenuRow({
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
      className="h-8 w-full justify-start gap-2 px-2 font-normal aria-pressed:bg-accent"
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="max-w-32 truncate text-xs text-muted-foreground">{detail}</span>
    </Button>
  );
}

function MenuSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2" aria-busy="true">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}
