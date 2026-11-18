import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { Label } from "@aven/ui/label";
import { LabeledSelect } from "@aven/ui/labeled-select";
import { Switch } from "@aven/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@aven/ui/tabs";

import type { useAddProject } from "../hooks/use-add-project";
import type { GithubInstallationInfo } from "../types";

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
          Install the Aven app on GitHub and choose the repositories it may reach. Aven Cloud needs
          it for every project: a repository is where a thread's work lasts.
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
      <Tabs
        value={state.githubMode}
        onValueChange={(next) => state.setGithubMode(next === "new" ? "new" : "existing")}
      >
        <TabsList aria-label="Repository">
          <TabsTrigger value="existing">Existing</TabsTrigger>
          <TabsTrigger value="new">New repository</TabsTrigger>
        </TabsList>
      </Tabs>
      {state.githubMode === "new" ? (
        <NewRepository state={state} info={github.installationInfo} />
      ) : (
        <ExistingRepository state={state} />
      )}
    </>
  );
}

function ExistingRepository({ state }: Props) {
  const { github } = state;

  return (
    <>
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

function NewRepository({ state, info }: Props & { info: GithubInstallationInfo | null }) {
  const { github } = state;

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        <Label htmlFor="new-repository-name">Name</Label>
        <Input
          id="new-repository-name"
          value={state.newName}
          onChange={(event) => state.setNewName(event.target.value)}
          placeholder="my-project"
          maxLength={100}
          autoFocus
        />
        <span className="text-xs text-muted-foreground">
          Aven makes it on GitHub
          {info ? ` in ${info.accountLogin}` : ""} with a README, then starts threads from it.
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Switch
          size="sm"
          aria-label="Private repository"
          checked={state.privateRepository}
          onCheckedChange={state.setPrivateRepository}
        />
        <span>Private</span>
      </div>
      {github.installationInfoError && (
        <p className="text-xs text-destructive">{github.installationInfoError}</p>
      )}
      {info && !info.canCreateRepository && (
        <p className="text-xs text-muted-foreground">
          The Aven app needs its new permissions approved before it can make a repository here.{" "}
          <a href={info.settingsUrl} className="underline" target="_blank" rel="noreferrer">
            Approve them on GitHub
          </a>
          .
        </p>
      )}
    </>
  );
}
