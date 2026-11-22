import {
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconExternalLink,
  IconGitMerge,
  IconGitPullRequest,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";
import { Skeleton } from "@aven/ui/skeleton";
import { Textarea } from "@aven/ui/textarea";
import { shortTimeAgo } from "@/lib/format";

import type { GitCenterCheckLogResponse, GitCenterPullDetailResponse } from "../types";
import { GitDiffViewer } from "./git-diff-viewer";

type Props = {
  data: GitCenterPullDetailResponse | null;
  loading: boolean;
  busy: boolean;
  logsByCheck: Record<number, GitCenterCheckLogResponse>;
  loadingCheckId: number | null;
  onLoadCheckLogs: (checkRunId: number) => Promise<GitCenterCheckLogResponse | null>;
  onReview: (event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string) => Promise<boolean>;
  onMerge: (method: "merge" | "squash" | "rebase" | "enqueue") => Promise<boolean>;
  onUpdateBranch: () => Promise<boolean>;
  onSetState: (state: "open" | "closed") => Promise<boolean>;
  onFixCiWithAgent: (
    pullNumber: number,
    branch: string,
    checkName: string,
    logSnippet?: string,
  ) => void;
};

export function GitPrInspector({
  data,
  loading,
  busy,
  logsByCheck,
  loadingCheckId,
  onLoadCheckLogs,
  onReview,
  onMerge,
  onUpdateBranch,
  onSetState,
  onFixCiWithAgent,
}: Props) {
  const [reviewBody, setReviewBody] = useState("");
  const [expandedCheck, setExpandedCheck] = useState<number | null>(null);

  const patch = useMemo(() => {
    if (!data) return "";

    return data.pull.files
      .flatMap((file) => {
        if (!file.patch) return [];

        const from = file.oldPath ?? file.path;
        return [
          `diff --git a/${from} b/${file.path}`,
          `--- a/${from}`,
          `+++ b/${file.path}`,
          file.patch,
        ];
      })
      .join("\n");
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
        Select a pull request to inspect checks, reviews, and diffs.
      </div>
    );
  }

  const { pull, unresolvedComments, githubConnected } = data;
  const isOpen = pull.status === "open" || pull.status === "draft";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2.5 border-b border-border p-3 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <IconGitPullRequest className="size-4 shrink-0 text-primary" />
              <span className="font-mono text-muted-foreground">#{pull.number}</span>
              <Badge variant={pull.status === "merged" ? "default" : "secondary"}>
                {pull.status}
              </Badge>
            </div>
            <h3 className="mt-1 text-sm font-semibold">{pull.title}</h3>
          </div>
          <a
            href={pull.url}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
            title="Open PR on GitHub"
          >
            <IconExternalLink className="size-4" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.6875rem] text-muted-foreground">
          <Badge variant="outline" className="font-mono text-[0.625rem]">
            {pull.head}
          </Badge>
          <span>→</span>
          <Badge variant="outline" className="font-mono text-[0.625rem]">
            {pull.base}
          </Badge>
          <span>
            · +{pull.additions} -{pull.deletions}
          </span>
          <span>· {shortTimeAgo(pull.updatedAt)}</span>
        </div>

        {pull.checks.runs.length > 0 && (
          <div className="rounded-md border border-border bg-muted/30 p-2">
            <div className="mb-1.5 flex items-center justify-between text-[0.6875rem] font-semibold">
              <span>CI Checks ({pull.checks.runs.length})</span>
              <Badge
                variant={pull.checks.state === "failure" ? "destructive" : "secondary"}
                className="text-[0.625rem]"
              >
                {pull.checks.state}
              </Badge>
            </div>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {pull.checks.runs.map((run, idx) => {
                const checkId = run.id;
                const logData = checkId ? logsByCheck[checkId] : undefined;
                const isExpanded = checkId !== undefined && expandedCheck === checkId;
                return (
                  <div
                    key={`${run.name}-${idx}`}
                    className="rounded border border-border/50 bg-background p-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      {run.state === "success" && (
                        <IconCircleCheck className="size-3.5 shrink-0 text-primary" />
                      )}
                      {run.state === "failure" && (
                        <IconCircleX className="size-3.5 shrink-0 text-destructive" />
                      )}
                      {run.state === "pending" && (
                        <IconClock className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{run.name}</span>
                      {checkId && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-5 px-1.5 text-[0.625rem]"
                          disabled={loadingCheckId === checkId}
                          onClick={async () => {
                            if (isExpanded) {
                              setExpandedCheck(null);
                              return;
                            }

                            setExpandedCheck(checkId);

                            if (!logData) await onLoadCheckLogs(checkId);
                          }}
                        >
                          {loadingCheckId === checkId && "Loading…"}
                          {loadingCheckId !== checkId && (isExpanded ? "Hide logs" : "Logs")}
                        </Button>
                      )}
                      {run.state === "failure" && (
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-5 gap-1 px-1.5 text-[0.625rem]"
                          onClick={async () => {
                            const fetched =
                              checkId && !logData ? await onLoadCheckLogs(checkId) : logData;
                            onFixCiWithAgent(
                              pull.number,
                              pull.head,
                              run.name,
                              fetched?.logs ?? fetched?.text ?? run.summary ?? undefined,
                            );
                          }}
                        >
                          <IconSparkles className="size-3" />
                          <span>Fix CI</span>
                        </Button>
                      )}
                    </div>
                    {isExpanded && logData && (
                      <div className="mt-1.5 border-t border-border/50 pt-1.5">
                        {logData.scopeRequired ? (
                          <div className="text-[0.6875rem] text-muted-foreground">
                            Reconnect GitHub in{" "}
                            <Link to="/settings/github" className="underline">
                              Settings &gt; GitHub
                            </Link>{" "}
                            with Actions read permission to inspect job logs.
                          </div>
                        ) : (
                          <pre className="max-h-36 overflow-auto rounded bg-muted p-2 font-mono text-[0.625rem] whitespace-pre-wrap">
                            {logData.logs ||
                              logData.text ||
                              logData.summary ||
                              "No log output available."}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {unresolvedComments.length > 0 && (
          <div className="text-[0.6875rem] text-muted-foreground">
            {unresolvedComments.length} unresolved review thread
            {unresolvedComments.length === 1 ? "" : "s"}
          </div>
        )}

        {!githubConnected ? (
          <div className="rounded-md border border-border bg-muted/40 p-2 text-[0.6875rem] text-muted-foreground">
            Connect your GitHub account in{" "}
            <Link to="/settings/github" className="font-medium text-foreground underline">
              Settings &gt; GitHub
            </Link>{" "}
            to approve, merge, or update pull requests.
          </div>
        ) : (
          isOpen && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="xs" disabled={busy} />}>
                    <IconGitMerge className="size-3.5" />
                    <span>Merge</span>
                    <IconChevronDown className="size-3 opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => void onMerge("squash")}>
                      Squash and merge
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void onMerge("merge")}>
                      Create a merge commit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void onMerge("rebase")}>
                      Rebase and merge
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void onMerge("enqueue")}>
                      Add to merge queue
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={() => void onUpdateBranch()}
                >
                  <IconRefresh className="size-3.5" />
                  <span>Update branch</span>
                </Button>

                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() => void onSetState("closed")}
                >
                  Close PR
                </Button>
              </div>

              <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
                <Textarea
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  placeholder="Write a review comment…"
                  rows={2}
                  className="min-h-12 resize-none text-xs"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (await onReview("APPROVE", reviewBody)) setReviewBody("");
                    }}
                  >
                    <IconCheck className="size-3.5" />
                    <span>Approve</span>
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy || !reviewBody.trim()}
                    onClick={async () => {
                      if (await onReview("REQUEST_CHANGES", reviewBody)) setReviewBody("");
                    }}
                  >
                    Request changes
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy || !reviewBody.trim()}
                    onClick={async () => {
                      if (await onReview("COMMENT", reviewBody)) setReviewBody("");
                    }}
                  >
                    Comment
                  </Button>
                </div>
              </div>
            </div>
          )
        )}

        {githubConnected && pull.status === "closed" && (
          <div>
            <Button
              variant="outline"
              size="xs"
              disabled={busy}
              onClick={() => void onSetState("open")}
            >
              Reopen PR
            </Button>
          </div>
        )}
      </div>

      <GitDiffViewer
        patch={patch}
        truncated={pull.filesTruncated}
        emptyMessage="No file patches returned for this PR."
        resetKey={`pr-${pull.number}`}
      />
    </div>
  );
}
