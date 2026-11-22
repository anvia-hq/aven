import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconLock,
  IconMinus,
  IconPlus,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { cn } from "cn";
import { useState } from "react";

import type { GitActionPayload, GitWorkspaceStatusFile } from "@aven/protocol/types";
import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Checkbox } from "@aven/ui/checkbox";
import { Input } from "@aven/ui/input";
import { Label } from "@aven/ui/label";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@aven/ui/resizable";
import { Skeleton } from "@aven/ui/skeleton";
import { Textarea } from "@aven/ui/textarea";
import { safeStorage } from "@aven/ui/use-local-storage";
import { DiffStat } from "@/modules/diff/components/diff-stat";

import type { GitCenterWorkspaceResponse } from "../types";
import { GitDiffViewer } from "./git-diff-viewer";

type Props = {
  workspace: GitCenterWorkspaceResponse | null;
  loading: boolean;
  isLive: boolean;
  busyAction: string | null;
  selectedFile: { path: string; staged: boolean } | null;
  onSelectFile: (file: { path: string; staged: boolean } | null) => void;
  onAction: (action: GitActionPayload) => Promise<unknown>;
  onConfirmDiscard: (paths: string[]) => void;
  onResolveConflictsWithAgent: (
    operation: "merge" | "rebase" | "cherry-pick" | "revert",
    files: string[],
    threadId?: string,
  ) => void;
};

function statusTone(status: GitWorkspaceStatusFile["status"]) {
  if (status === "added" || status === "untracked") return "border-success/40 text-success";

  if (status === "deleted" || status === "conflicted") {
    return "border-destructive/40 text-destructive";
  }

  return "border-info/40 text-info";
}

function FileRow({
  file,
  stagedView,
  selected,
  canMutate,
  busy,
  onSelect,
  onToggleStage,
  onDiscard,
}: {
  file: GitWorkspaceStatusFile;
  stagedView: boolean;
  selected: boolean;
  canMutate: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggleStage: () => void;
  onDiscard?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      <Button
        variant="ghost"
        size="xs"
        className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-0 py-0.5 text-left font-normal hover:bg-transparent"
        onClick={onSelect}
      >
        <Badge
          variant="outline"
          className={cn(
            "h-4 w-4 shrink-0 justify-center px-0 font-mono text-[0.5625rem] uppercase",
            statusTone(file.status),
          )}
        >
          {file.status.slice(0, 1)}
        </Badge>
        <span
          className="min-w-0 flex-1 truncate text-left font-mono text-[0.6875rem]"
          title={file.path}
        >
          {file.path}
        </span>
      </Button>
      {canMutate && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={busy}
            aria-label={stagedView ? `Unstage ${file.path}` : `Stage ${file.path}`}
            title={stagedView ? "Unstage" : "Stage"}
            className="size-5"
            onClick={onToggleStage}
          >
            {stagedView ? <IconMinus className="size-3" /> : <IconPlus className="size-3" />}
          </Button>
          {!stagedView && onDiscard && (
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              aria-label={`Discard ${file.path}`}
              title="Discard changes"
              className="size-5 text-destructive hover:text-destructive"
              onClick={onDiscard}
            >
              <IconArrowBackUp className="size-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function GitWipInspector({
  workspace,
  loading,
  isLive,
  busyAction,
  selectedFile,
  onSelectFile,
  onAction,
  onConfirmDiscard,
  onResolveConflictsWithAgent,
}: Props) {
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [amend, setAmend] = useState(false);
  const [signoff, setSignoff] = useState(true);
  const split = useDefaultLayout({
    id: "aven.git-center.wip.split",
    panelIds: ["files", "diff"],
    storage: safeStorage,
  });

  if (!isLive) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
        <IconLock className="size-6 opacity-50" />
        <div className="font-medium text-foreground">
          Working tree unavailable in read-only mode
        </div>
        <p className="max-w-xs">
          Bring the project&apos;s runner online to inspect unstaged changes, stage files, and
          commit. You can still inspect commits and manage GitHub pull requests.
        </p>
      </div>
    );
  }

  if (loading && !workspace) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
        Could not load workspace status.
      </div>
    );
  }

  const busy = busyAction !== null;
  const stagedFiles = workspace.files.filter((f) => f.staged);
  const unstagedFiles = workspace.files.filter((f) => f.unstaged && f.status !== "conflicted");
  const conflictedFiles = workspace.files.filter((f) => f.status === "conflicted");
  const threadId = workspace.target.kind === "thread" ? workspace.target.threadId : undefined;

  const commit = async (andPush: boolean) => {
    const full = body.trim() ? `${summary.trim()}\n\n${body.trim()}` : summary.trim();

    if (!full) return;

    const done = await onAction({ op: "commit", message: full, amend, signoff });

    if (done) {
      setSummary("");
      setBody("");
      setAmend(false);

      if (andPush) await onAction({ op: "push" });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/15 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground">
            {workspace.target.kind === "project"
              ? "Project Working Tree"
              : `Thread: ${workspace.target.title}`}
          </div>
          <div className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">
            {workspace.branch ?? "HEAD (detached)"} ·{" "}
            <DiffStat additions={workspace.wip.additions} deletions={workspace.wip.deletions} />
          </div>
        </div>
        {workspace.running && (
          <Badge variant="outline" className="shrink-0 gap-1 text-[0.6875rem]">
            <IconLock className="size-3" />
            <span>Agent running</span>
          </Badge>
        )}
      </div>

      {workspace.conflicts && (
        <div className="border-b border-destructive/40 bg-destructive/10 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-destructive">
            <IconAlertTriangle className="size-4 shrink-0" />
            <span>
              Active {workspace.conflicts.operation} conflict ({workspace.conflicts.files.length}{" "}
              file{workspace.conflicts.files.length === 1 ? "" : "s"})
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              size="xs"
              disabled={busy}
              onClick={() =>
                onResolveConflictsWithAgent(
                  workspace.conflicts!.operation,
                  workspace.conflicts!.files,
                  threadId,
                )
              }
            >
              <IconSparkles className="size-3.5" />
              <span>Resolve with Agent</span>
            </Button>
            {workspace.canMutate && (
              <>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={busy || conflictedFiles.length > 0}
                  onClick={() => void onAction({ op: "conflict.continue" })}
                >
                  <IconCheck className="size-3.5" />
                  <span>Continue</span>
                </Button>
                <Button
                  variant="destructive"
                  size="xs"
                  disabled={busy}
                  onClick={() => void onAction({ op: "conflict.abort" })}
                >
                  <IconX className="size-3.5" />
                  <span>Abort</span>
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup
          orientation="vertical"
          defaultLayout={split.defaultLayout}
          onLayoutChanged={split.onLayoutChanged}
        >
          <ResizablePanel id="files" defaultSize="38" minSize="18" maxSize="70">
            <div className="flex h-full flex-col gap-2.5 overflow-y-auto p-3">
              {conflictedFiles.length > 0 && (
                <div>
                  <div className="mb-1 text-[0.6875rem] font-medium text-destructive">
                    Conflicted ({conflictedFiles.length})
                  </div>
                  {conflictedFiles.map((file) => (
                    <FileRow
                      key={`c-${file.path}`}
                      file={file}
                      stagedView={false}
                      selected={selectedFile?.path === file.path}
                      canMutate={workspace.canMutate}
                      busy={busy}
                      onSelect={() => onSelectFile({ path: file.path, staged: false })}
                      onToggleStage={() => void onAction({ op: "stage", paths: [file.path] })}
                    />
                  ))}
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[0.6875rem] font-medium text-muted-foreground">
                    Staged ({stagedFiles.length})
                  </span>
                  {workspace.canMutate && stagedFiles.length > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-5 px-1.5 text-[0.6875rem]"
                      disabled={busy}
                      onClick={() => void onAction({ op: "unstage", all: true })}
                    >
                      Unstage all
                    </Button>
                  )}
                </div>
                {stagedFiles.length === 0 ? (
                  <div className="px-1.5 text-[0.6875rem] text-muted-foreground/80">
                    No staged files
                  </div>
                ) : (
                  stagedFiles.map((file) => (
                    <FileRow
                      key={`s-${file.path}`}
                      file={file}
                      stagedView
                      selected={selectedFile?.path === file.path && selectedFile.staged}
                      canMutate={workspace.canMutate}
                      busy={busy}
                      onSelect={() => onSelectFile({ path: file.path, staged: true })}
                      onToggleStage={() => void onAction({ op: "unstage", paths: [file.path] })}
                    />
                  ))
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[0.6875rem] font-medium text-muted-foreground">
                    Unstaged ({unstagedFiles.length})
                  </span>
                  {workspace.canMutate && unstagedFiles.length > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-5 px-1.5 text-[0.6875rem]"
                      disabled={busy}
                      onClick={() => void onAction({ op: "stage", all: true })}
                    >
                      Stage all
                    </Button>
                  )}
                </div>
                {unstagedFiles.length === 0 ? (
                  <div className="px-1.5 text-[0.6875rem] text-muted-foreground/80">
                    Working tree clean
                  </div>
                ) : (
                  unstagedFiles.map((file) => (
                    <FileRow
                      key={`u-${file.path}`}
                      file={file}
                      stagedView={false}
                      selected={selectedFile?.path === file.path && !selectedFile.staged}
                      canMutate={workspace.canMutate}
                      busy={busy}
                      onSelect={() => onSelectFile({ path: file.path, staged: false })}
                      onToggleStage={() => void onAction({ op: "stage", paths: [file.path] })}
                      onDiscard={() => onConfirmDiscard([file.path])}
                    />
                  ))
                )}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="h-px bg-border/70 transition-colors hover:bg-primary/50"
          />

          <ResizablePanel id="diff" defaultSize="62" minSize="25">
            <div className="flex h-full min-h-0 flex-col">
              <GitDiffViewer
                patch={workspace.patch}
                truncated={workspace.truncated}
                emptyMessage="Select a file or stage changes to inspect the diff."
                resetKey={`${workspace.target.kind}:${threadId ?? ""}:${selectedFile?.path ?? ""}:${selectedFile?.staged ? "s" : "u"}`}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {workspace.canMutate && (
        <div className="shrink-0 border-t border-border/70 bg-muted/15 p-3">
          <div className="flex flex-col gap-2">
            <Input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Commit summary (e.g. feat: add git center)"
              className="h-8 text-xs"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Optional description…"
              rows={2}
              className="min-h-14 resize-none text-xs"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal">
                  <Checkbox checked={signoff} onCheckedChange={(v) => setSignoff(v === true)} />
                  <span>Sign off (-s)</span>
                </Label>
                <Label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal">
                  <Checkbox checked={amend} onCheckedChange={(v) => setAmend(v === true)} />
                  <span>Amend</span>
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy || !summary.trim() || (stagedFiles.length === 0 && !amend)}
                  onClick={() => void commit(false)}
                >
                  Commit
                </Button>
                <Button
                  size="xs"
                  disabled={busy || !summary.trim() || (stagedFiles.length === 0 && !amend)}
                  onClick={() => void commit(true)}
                >
                  Commit &amp; Push
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
