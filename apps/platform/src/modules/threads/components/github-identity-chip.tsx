import type { RunnerGithub } from "@aven/protocol/types";

import { githubIdentityNote } from "../github-identity";

export function GithubIdentityChip({ runnerGithub }: { runnerGithub: RunnerGithub | null }) {
  const note = githubIdentityNote(runnerGithub);

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
