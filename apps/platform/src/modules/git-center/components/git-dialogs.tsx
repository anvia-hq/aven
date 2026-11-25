import { IconGitBranch, IconHistory, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import type { GitActionPayload, GitReflogEntry } from "@aven/protocol/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@aven/ui/alert-dialog";
import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Checkbox } from "@aven/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aven/ui/dialog";
import { Input } from "@aven/ui/input";
import { Label } from "@aven/ui/label";
import { Textarea } from "@aven/ui/textarea";
import { shortTimeAgo } from "@/lib/format";

import type { GitConfirmRequest, GitHygieneSummary } from "../types";

export function CreateBranchDialog({
  open,
  startPoint,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  startPoint?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, checkout: boolean, startPoint?: string) => void;
}) {
  const [name, setName] = useState("");
  const [checkout, setCheckout] = useState(true);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create branch</DialogTitle>
          <DialogDescription>
            {startPoint
              ? `Create a new branch starting at ${startPoint.slice(0, 10)}.`
              : "Create a new branch from HEAD."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="feat/my-branch"
          />
          <Label className="flex cursor-pointer items-center gap-2 text-xs font-normal">
            <Checkbox checked={checkout} onCheckedChange={(v) => setCheckout(v === true)} />
            <span>Switch to the new branch immediately</span>
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={() => {
              onSubmit(name.trim(), checkout, startPoint);
              onOpenChange(false);
            }}
          >
            Create branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RenameBranchDialog({
  branchName,
  onOpenChange,
  onSubmit,
}: {
  branchName: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (oldName: string, newName: string) => void;
}) {
  const [nextName, setNextName] = useState(branchName ?? "");

  useEffect(() => {
    if (branchName) setNextName(branchName);
  }, [branchName]);

  return (
    <Dialog open={branchName !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename branch</DialogTitle>
          <DialogDescription>Rename local branch {branchName}.</DialogDescription>
        </DialogHeader>
        <Input value={nextName} onChange={(e) => setNextName(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!branchName || !nextName.trim() || nextName.trim() === branchName}
            onClick={() => {
              if (branchName) onSubmit(branchName, nextName.trim());

              onOpenChange(false);
            }}
          >
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StashDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (message: string, includeUntracked: boolean) => void;
}) {
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);

  useEffect(() => {
    if (open) setMessage("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stash changes</DialogTitle>
          <DialogDescription>
            Save current working tree changes onto the stash stack.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional stash message"
            className="text-xs"
          />
          <Label className="flex cursor-pointer items-center gap-2 text-xs font-normal">
            <Checkbox
              checked={includeUntracked}
              onCheckedChange={(v) => setIncludeUntracked(v === true)}
            />
            <span>Include untracked files (-u)</span>
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSubmit(message.trim(), includeUntracked);
              onOpenChange(false);
            }}
          >
            Stash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePrDialog({
  open,
  defaultHead,
  defaultBase,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  defaultHead: string;
  defaultBase: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    title: string;
    body: string;
    head: string;
    base: string;
    draft: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState(defaultHead);
  const [base, setBase] = useState(defaultBase);
  const [draft, setDraft] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setHead(defaultHead);
      setBase(defaultBase);
      setDraft(false);
    }
  }, [defaultBase, defaultHead, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Pull Request</DialogTitle>
          <DialogDescription>
            Open a new GitHub pull request directly from Git Center.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={head}
              onChange={(e) => setHead(e.target.value)}
              placeholder="Head branch"
            />
            <Input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="Base branch"
            />
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pull request title"
            className="text-xs"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe your changes…"
            rows={4}
            className="text-xs"
          />
          <Label className="flex cursor-pointer items-center gap-2 text-xs font-normal">
            <Checkbox checked={draft} onCheckedChange={(v) => setDraft(v === true)} />
            <span>Create as draft pull request</span>
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!title.trim() || !head.trim() || !base.trim()}
            onClick={() => {
              onSubmit({
                title: title.trim(),
                body: body.trim(),
                head: head.trim(),
                base: base.trim(),
                draft,
              });
              onOpenChange(false);
            }}
          >
            Open PR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReflogDialog({
  open,
  entries,
  loading,
  onOpenChange,
  onRestore,
  onCreateBranch,
}: {
  open: boolean;
  entries: GitReflogEntry[];
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (selector: string, sha: string) => void;
  onCreateBranch: (sha: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconHistory className="size-4" />
            <span>Undo / Reflog Recovery</span>
          </DialogTitle>
          <DialogDescription>
            Recover lost commits, undo accidental resets, or branch off a previous HEAD state.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {loading && (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading reflog…</div>
          )}
          {!loading && entries.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No reflog entries yet.
            </div>
          )}
          {!loading &&
            entries.map((entry) => (
              <div
                key={`${entry.selector}-${entry.sha}`}
                className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-xs"
              >
                <Badge variant="outline" className="shrink-0 font-mono text-[0.625rem]">
                  {entry.selector}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    <span className="mr-1.5 font-mono text-muted-foreground">{entry.shortSha}</span>
                    <span>
                      {entry.action}: {entry.message}
                    </span>
                  </div>
                  <div className="text-[0.6875rem] text-muted-foreground">
                    {entry.date ? shortTimeAgo(entry.date) : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    onOpenChange(false);
                    onCreateBranch(entry.sha);
                  }}
                >
                  <IconGitBranch className="size-3.5" />
                  <span>Branch</span>
                </Button>
                {entry.index > 0 && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      onOpenChange(false);
                      onRestore(entry.selector, entry.sha);
                    }}
                  >
                    Restore
                  </Button>
                )}
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HygieneDialog({
  open,
  hygiene,
  onOpenChange,
  onRunAction,
}: {
  open: boolean;
  hygiene: GitHygieneSummary;
  onOpenChange: (open: boolean) => void;
  onRunAction: (action: GitActionPayload) => Promise<unknown>;
}) {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [forceGone, setForceGone] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedBranches(hygiene.mergedBranches.map((b) => b.name));
      setForceGone(false);
    }
  }, [hygiene.mergedBranches, open]);

  const toggle = (name: string) => {
    setSelectedBranches((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconTrash className="size-4" />
            <span>Branch &amp; Worktree Cleanup</span>
          </DialogTitle>
          <DialogDescription>
            Safely remove merged local branches, gone upstream branches, and stale worktrees.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-96 flex-col gap-4 overflow-y-auto text-xs">
          <div>
            <div className="mb-1.5 font-semibold">
              Merged Local Branches ({hygiene.mergedBranches.length})
            </div>
            {hygiene.mergedBranches.length === 0 ? (
              <div className="text-muted-foreground">No merged local branches to clean up.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {hygiene.mergedBranches.map((b) => (
                  <Label
                    key={b.name}
                    className="flex cursor-pointer items-center gap-2 text-xs font-normal"
                  >
                    <Checkbox
                      checked={selectedBranches.includes(b.name)}
                      onCheckedChange={() => toggle(b.name)}
                    />
                    <span className="font-mono">{b.name}</span>
                  </Label>
                ))}
              </div>
            )}
          </div>

          {hygiene.goneBranches.length > 0 && (
            <div>
              <div className="mb-1.5 font-semibold">
                Gone Remote Tracking Branches ({hygiene.goneBranches.length})
              </div>
              <div className="flex flex-col gap-1">
                {hygiene.goneBranches.map((b) => (
                  <Label
                    key={b.name}
                    className="flex cursor-pointer items-center gap-2 text-xs font-normal"
                  >
                    <Checkbox
                      checked={selectedBranches.includes(b.name)}
                      onCheckedChange={() => toggle(b.name)}
                    />
                    <span className="font-mono">{b.name}</span>
                    <Badge variant="outline" className="text-[0.625rem]">
                      gone
                    </Badge>
                  </Label>
                ))}
              </div>
              <Label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-normal text-muted-foreground">
                <Checkbox checked={forceGone} onCheckedChange={(v) => setForceGone(v === true)} />
                <span>Force delete (-D) for squash-merged gone branches</span>
              </Label>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between font-semibold">
              <span>Linked Worktrees ({hygiene.removableWorktrees.length})</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void onRunAction({ op: "worktree.prune" })}
              >
                Prune metadata
              </Button>
            </div>
            {hygiene.removableWorktrees.length === 0 ? (
              <div className="text-muted-foreground">No linked worktrees found.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {hygiene.removableWorktrees.map((wt) => (
                  <div
                    key={wt.path}
                    className="flex items-center justify-between gap-2 rounded border border-border p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono">{wt.path}</div>
                      <div className="text-[0.6875rem] text-muted-foreground">
                        {wt.branch ?? "detached"} {wt.prunable ? "· prunable" : ""}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove worktree ${wt.path}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        void onRunAction({
                          op: "worktree.remove",
                          path: wt.path,
                          force: wt.prunable,
                        })
                      }
                    >
                      <IconTrash className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedBranches.length === 0}
            onClick={async () => {
              await onRunAction({
                op: "branches.cleanup",
                branches: selectedBranches,
                force: forceGone,
              });
              onOpenChange(false);
            }}
          >
            Delete {selectedBranches.length} branch{selectedBranches.length === 1 ? "" : "es"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmGitActionDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: GitConfirmRequest | null;
  onClose: () => void;
  onConfirm: (req: GitConfirmRequest) => void;
}) {
  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (request) onConfirm(request);

              onClose();
            }}
          >
            {request?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
