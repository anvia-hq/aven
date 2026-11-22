import {
  IconAlertCircle,
  IconBook2,
  IconCheck,
  IconExternalLink,
  IconLock,
  IconSearch,
  IconWorld,
} from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { Label } from "@aven/ui/label";
import { LabeledSelect } from "@aven/ui/labeled-select";
import { PanelNotice } from "@aven/ui/panel-notice";
import { Skeleton } from "@aven/ui/skeleton";
import { Switch } from "@aven/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@aven/ui/tabs";

import { GithubMark } from "@/components/brand-icons";

import type { useAddProject } from "../hooks/use-add-project";
import type { GithubInstallationInfo } from "../types";

type Props = { state: ReturnType<typeof useAddProject> };

const SKELETON_WIDTHS = ["46%", "62%", "38%", "54%"];

const LINE_TAB_CLASS =
  "relative flex-none rounded-none border-0 bg-transparent px-0.5 pt-1 pb-2.5 text-sm font-medium text-muted-foreground shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent hover:text-foreground data-active:bg-transparent data-active:text-foreground data-active:after:bg-foreground dark:data-active:bg-transparent";

export function GithubRepositoryChoice({ state }: Props) {
  const { github } = state;

  if (!github.loaded)
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-8 w-44 rounded-md" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );

  if (!github.configured)
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed bg-muted/25 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <GithubMark className="size-4 text-muted-foreground" />
          <span>GitHub is not configured yet</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          A platform owner can create the GitHub app in Settings to connect repositories.
        </p>
      </div>
    );

  if (github.installations.length === 0)
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-muted/25 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <GithubMark className="size-4 text-muted-foreground" />
          <span>Connect your GitHub account</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Install the Aven app on GitHub and choose the repositories it may reach. Aven Cloud uses a
          repository so a thread&apos;s work persists across runs.
        </p>
        {github.installUrl && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={github.installUrl} />}
          >
            <GithubMark className="size-3.5" />
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
        <TabsList
          variant="line"
          aria-label="Repository"
          className="h-auto! w-full justify-start gap-5 rounded-none border-b border-border/80 bg-transparent p-0"
        >
          <TabsTrigger value="existing" className={LINE_TAB_CLASS}>
            Existing
          </TabsTrigger>
          <TabsTrigger value="new" className={LINE_TAB_CLASS}>
            New repository
          </TabsTrigger>
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
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? github.repositories.filter((repo) => repo.fullName.toLowerCase().includes(needle))
    : github.repositories;

  let body = (
    <div className="flex flex-col p-1" aria-busy="true">
      {SKELETON_WIDTHS.map((width) => (
        <div key={width} className="flex h-9 items-center gap-2.5 px-2.5">
          <Skeleton className="size-3.5 rounded-sm" />
          <Skeleton className="h-3" style={{ width }} />
        </div>
      ))}
    </div>
  );

  if (github.repositoriesError) {
    body = <PanelNotice>{github.repositoriesError}</PanelNotice>;
  } else if (github.repositoriesLoaded && github.repositories.length === 0) {
    body = <PanelNotice>No repositories available for this GitHub installation.</PanelNotice>;
  } else if (github.repositoriesLoaded && matches.length === 0) {
    body = <PanelNotice>No repositories match &ldquo;{query.trim()}&rdquo;.</PanelNotice>;
  } else if (github.repositoriesLoaded) {
    body = (
      <ul className="flex flex-col gap-0.5 p-1">
        {matches.map((repo) => {
          const selected = repo.fullName === state.githubRepository;
          const slash = repo.fullName.indexOf("/");
          const owner = slash > -1 ? repo.fullName.slice(0, slash + 1) : "";
          const name = slash > -1 ? repo.fullName.slice(slash + 1) : repo.fullName;

          return (
            <li key={repo.fullName}>
              <Button
                type="button"
                variant="ghost"
                aria-pressed={selected}
                className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-left font-normal select-none aria-pressed:bg-accent/80 aria-pressed:text-foreground"
                onClick={() => state.setGithubRepository(repo.fullName)}
              >
                {repo.private ? (
                  <IconLock className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <IconBook2 className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-left">
                  {owner && <span className="text-muted-foreground">{owner}</span>}
                  <span className="font-medium text-foreground">{name}</span>
                </span>
                {selected && <IconCheck className="size-4 shrink-0 text-foreground" />}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background/40">
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/25 px-3 py-1.5">
          <IconSearch className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            aria-label="Filter repositories"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories…"
            className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
      {github.installUrl && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Not listed?</span>
          <a
            href={github.installUrl}
            className="inline-flex items-center gap-1 text-foreground/80 underline underline-offset-3 hover:text-foreground"
          >
            Add it to the Aven app on GitHub
            <IconExternalLink className="size-3" />
          </a>
        </p>
      )}
    </div>
  );
}

function NewRepository({ state, info }: Props & { info: GithubInstallationInfo | null }) {
  const { github } = state;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="new-repository-name">Name</Label>
        <div className="flex items-center gap-2">
          {info && (
            <span className="flex h-8 shrink-0 items-center rounded-lg border bg-muted/40 px-2.5 font-mono text-xs text-muted-foreground">
              {info.accountLogin} /
            </span>
          )}
          <Input
            id="new-repository-name"
            value={state.newName}
            onChange={(event) => state.setNewName(event.target.value)}
            placeholder="my-project"
            maxLength={100}
            autoFocus
            className="min-w-0 flex-1"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          Created on GitHub with an initial README so you can start threads right away.
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          {state.privateRepository ? (
            <IconLock className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <IconWorld className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {state.privateRepository ? "Private repository" : "Public repository"}
            </span>
            <span className="text-xs text-muted-foreground">
              {state.privateRepository
                ? "Only people with access can see this repository."
                : "Anyone on GitHub can see this repository."}
            </span>
          </div>
        </div>
        <Switch
          size="sm"
          aria-label="Private repository"
          checked={state.privateRepository}
          onCheckedChange={state.setPrivateRepository}
        />
      </div>
      {github.installationInfoError && (
        <p className="text-xs text-destructive">{github.installationInfoError}</p>
      )}
      {info && !info.canCreateRepository && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <IconAlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <p>
            The Aven app needs its new permissions approved before it can make a repository here.{" "}
            <a
              href={info.settingsUrl}
              className="text-foreground underline underline-offset-3"
              target="_blank"
              rel="noreferrer"
            >
              Approve them on GitHub
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
