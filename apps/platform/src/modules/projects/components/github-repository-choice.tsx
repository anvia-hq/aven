import { Button } from "@aven/ui/button";
import { LabeledSelect } from "@aven/ui/labeled-select";

import type { useAddProject } from "../hooks/use-add-project";

type Props = { state: ReturnType<typeof useAddProject> };

export function GithubRepositoryChoice({ state }: Props) {
  const { github } = state;

  if (!github.loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!github.configured)
    return (
      <p className="text-sm text-muted-foreground">
        GitHub is not set up on this control plane yet. A platform owner can create the GitHub app
        in Settings.
      </p>
    );

  if (github.installations.length === 0)
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-muted-foreground">
          Install the Aven app on GitHub and choose the repositories it may reach.
        </p>
        {github.installUrl && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={github.installUrl} />}
          >
            Install on GitHub
          </Button>
        )}
      </div>
    );

  return (
    <>
      {github.installations.length > 1 && (
        <LabeledSelect
          label="Account"
          options={state.githubInstallations}
          value={github.installation}
          onChange={(next) => {
            github.chooseInstallation(next);
            state.setGithubRepository("");
          }}
          placeholder="Choose an account"
        />
      )}
      <LabeledSelect
        label="Repository"
        options={state.githubRepositories}
        value={state.githubRepository}
        onChange={state.setGithubRepository}
        placeholder={github.repositoriesLoaded ? "Choose a repository" : "Loading…"}
      />
      {github.repositoriesError && (
        <p className="text-xs text-destructive">{github.repositoriesError}</p>
      )}
      {github.installUrl && (
        <p className="text-xs text-muted-foreground">
          Not listed?{" "}
          <a href={github.installUrl} className="underline">
            Add it to the Aven app on GitHub
          </a>
          .
        </p>
      )}
    </>
  );
}
