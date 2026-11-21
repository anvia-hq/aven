import { IconPlus } from "@tabler/icons-react";

import { Button } from "@aven/ui/button";
import { GithubMark } from "@/components/brand-icons";

import { useGithubRepositories } from "../hooks/use-github-repositories";
import { projectPlace } from "../place";
import type { GithubRepository, Project } from "../types";
import {
  matchesProjectQuery,
  MenuGroup,
  MenuNote,
  MenuRow,
  MenuSkeleton,
  ProjectRows,
} from "./project-menu-parts";

type Props = {
  query: string;
  projects: Project[];
  value: string | undefined;
  adding: boolean;
  onPick: (projectId: string) => void;
  onNew: () => void;
  onAdd: (installationId: string, repository: GithubRepository) => void;
};

function NewRepositoryRow({ adding, onNew }: { adding: boolean; onNew: () => void }) {
  return (
    <div className="py-1">
      <MenuRow
        icon={<IconPlus className="size-4" />}
        label="New repository"
        detail="Aven makes one on GitHub"
        disabled={adding}
        onClick={onNew}
      />
    </div>
  );
}

function GithubNote({
  configured,
  installUrl,
}: {
  configured: boolean;
  installUrl: string | null;
}) {
  if (!configured) return <MenuNote>GitHub is not set up on this control plane yet.</MenuNote>;

  return (
    <MenuNote>
      {installUrl ? (
        <a href={installUrl} className="underline">
          Install the Aven app on GitHub
        </a>
      ) : (
        "Install the Aven app on GitHub"
      )}{" "}
      to add a repository.
    </MenuNote>
  );
}

export function ProjectMenuRepositories({
  query,
  projects,
  value,
  adding,
  onPick,
  onNew,
  onAdd,
}: Props) {
  const github = useGithubRepositories(true);
  const listed = github.repositories.filter((repository) =>
    matchesProjectQuery(query, repository.fullName),
  );
  const projectOf = (fullName: string) =>
    projects.find((project) => project.repoFullName?.toLowerCase() === fullName.toLowerCase());

  const browsing = github.loaded && github.configured && github.installations.length > 0;
  const waiting = !github.loaded || (github.installation !== "" && !github.repositoriesLoaded);
  const shown = projects.filter(
    (project) =>
      project.repoFullName !== null &&
      matchesProjectQuery(query, project.name, projectPlace(project)) &&
      !listed.some(
        (repository) => repository.fullName.toLowerCase() === project.repoFullName?.toLowerCase(),
      ),
  );

  if (waiting && shown.length === 0) return <MenuSkeleton />;

  if (!browsing && shown.length === 0)
    return (
      <>
        {github.configured && <NewRepositoryRow adding={adding} onNew={onNew} />}
        <GithubNote configured={github.configured} installUrl={github.installUrl} />
      </>
    );

  return (
    <>
      {github.configured && <NewRepositoryRow adding={adding} onNew={onNew} />}
      <ProjectRows label="Repositories" projects={shown} value={value} onPick={onPick} />
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
