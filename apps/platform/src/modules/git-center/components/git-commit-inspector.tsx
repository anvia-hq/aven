import {
  IconCopy,
  IconExternalLink,
  IconGitBranch,
  IconGitCherryPick,
  IconRotate2,
  IconSparkles,
} from "@tabler/icons-react";

import type { GitActionPayload } from "@aven/protocol/types";
import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Skeleton } from "@aven/ui/skeleton";
import { toast } from "@aven/ui/toast";
import { shortTimeAgo } from "@/lib/format";

import type { GitCenterCommitDetail } from "../types";
import { GitDiffViewer } from "./git-diff-viewer";

type Props = {
  commit: GitCenterCommitDetail | null;
  loading: boolean;
  isLive: boolean;
  busyAction: string | null;
  onSelectCommit: (sha: string) => void;
  onAction: (action: GitActionPayload) => void;
  onCreateBranchFrom: (sha: string) => void;
  onStartThreadFromRef: (ref: string) => void;
};

export function GitCommitInspector({
  commit,
  loading,
  isLive,
  busyAction,
  onSelectCommit,
  onAction,
  onCreateBranchFrom,
  onStartThreadFromRef,
}: Props) {
  if (loading && !commit) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!commit) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
        Select a commit from the graph to inspect its diff.
      </div>
    );
  }

  const busy = busyAction !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">{commit.message}</h3>
            {commit.body && (
              <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                {commit.body}
              </pre>
            )}
          </div>
          {commit.url && (
            <a
              href={commit.url}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
              title="Open on GitHub"
            >
              <IconExternalLink className="size-4" />
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted-foreground">
          <Button
            variant="ghost"
            size="xs"
            className="h-5 gap-1 px-1.5 font-mono text-[0.6875rem]"
            onClick={() => {
              void navigator.clipboard.writeText(commit.sha);
              toast.add({ title: `Copied ${commit.sha.slice(0, 7)}`, type: "info" });
            }}
          >
            <span>{commit.sha.slice(0, 10)}</span>
            <IconCopy className="size-3" />
          </Button>
          {commit.author && <span>{commit.author}</span>}
          {commit.date && <span>· {shortTimeAgo(commit.date)}</span>}
          <span className="font-mono">
            · {commit.filesChanged} file{commit.filesChanged === 1 ? "" : "s"} (+{commit.additions}{" "}
            -{commit.deletions})
          </span>
        </div>

        {commit.parents.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[0.6875rem] text-muted-foreground">
            <span>Parents:</span>
            {commit.parents.map((parent) => (
              <Badge
                key={parent}
                variant="outline"
                className="cursor-pointer font-mono text-[0.625rem] hover:bg-accent"
                onClick={() => onSelectCommit(parent)}
              >
                {parent.slice(0, 7)}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Button size="xs" disabled={busy} onClick={() => onStartThreadFromRef(commit.sha)}>
            <IconSparkles className="size-3.5" />
            <span>Start Thread</span>
          </Button>
          {isLive && (
            <>
              <Button
                variant="outline"
                size="xs"
                disabled={busy}
                onClick={() => onCreateBranchFrom(commit.sha)}
              >
                <IconGitBranch className="size-3.5" />
                <span>Branch</span>
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={busy}
                onClick={() => onAction({ op: "cherryPick", sha: commit.sha })}
              >
                <IconGitCherryPick className="size-3.5" />
                <span>Cherry-pick</span>
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={busy}
                onClick={() => onAction({ op: "revert", sha: commit.sha })}
              >
                <IconRotate2 className="size-3.5" />
                <span>Revert</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <GitDiffViewer
        patch={commit.patch}
        truncated={commit.truncated}
        emptyMessage="This commit has no text diff."
        resetKey={commit.sha}
      />
    </div>
  );
}
