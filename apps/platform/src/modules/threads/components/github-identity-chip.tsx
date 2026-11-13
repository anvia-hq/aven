import type { RunnerGithub, RuntimeGithubMode } from "@aven/protocol/types";

import { githubIdentityNote } from "../github-identity";

type Props = { runnerGithub: RunnerGithub | null; githubMode: RuntimeGithubMode };

export function GithubIdentityChip({ runnerGithub, githubMode }: Props) {
  const note = githubIdentityNote(runnerGithub, githubMode);

  if (!note) return null;

  return (
    <span
      title={note.detail}
      className="hidden max-w-48 shrink truncate text-xs text-muted-foreground @2xl:inline"
    >
      {note.label}
    </span>
  );
}
