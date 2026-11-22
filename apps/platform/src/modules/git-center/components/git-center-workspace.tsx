import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@aven/ui/resizable";
import { Skeleton } from "@aven/ui/skeleton";
import { safeStorage, useLocalStorage } from "@aven/ui/use-local-storage";
import { useMediaQuery } from "@aven/ui/use-media-query";
import { useProjects } from "@/modules/projects/hooks/use-projects";

import { buildGraphRows, computeHygiene } from "../graph-rows";
import { useGitCenter } from "../hooks/use-git-center";
import { useGitPullRequest } from "../hooks/use-git-pull-request";
import { useGitTabs } from "../hooks/use-git-tabs";
import type { GitConfirmRequest } from "../types";
import { GitCommitInspector } from "./git-commit-inspector";
import {
  ConfirmGitActionDialog,
  CreateBranchDialog,
  CreatePrDialog,
  HygieneDialog,
  ReflogDialog,
  RenameBranchDialog,
  StashDialog,
} from "./git-dialogs";
import { GitGraphPane } from "./git-graph-pane";
import { GitPrInspector } from "./git-pr-inspector";
import { GitRefsSidebar } from "./git-refs-sidebar";
import { GitTabBar } from "./git-tab-bar";
import { GitToolbar } from "./git-toolbar";
import { GitWipInspector } from "./git-wip-inspector";

type Props = {
  projectId: string;
};

const HANDLE_CLASS =
  "w-px bg-border/70 transition-colors hover:bg-primary/50 data-[resize-handle-active]:bg-primary/70 after:w-2.5";

export function GitCenterWorkspace({ projectId }: Props) {
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width: 1024px)");
  const { projects } = useProjects();
  const { tabIds, openTab, closeTab } = useGitTabs();
  const center = useGitCenter(projectId);
  const pr = useGitPullRequest(
    projectId,
    center.inspector.kind === "pr" ? center.inspector.number : null,
    center.refresh,
  );

  const [refsOpen, setRefsOpen] = useLocalStorage("aven.git-center.refs-open", true);
  const [inspectorOpen, setInspectorOpen] = useLocalStorage("aven.git-center.inspector-open", true);
  const [createBranchState, setCreateBranchState] = useState<{
    open: boolean;
    startPoint?: string;
  }>({ open: false });
  const [renameBranch, setRenameBranch] = useState<string | null>(null);
  const [stashOpen, setStashOpen] = useState(false);
  const [reflogOpen, setReflogOpen] = useState(false);
  const [hygieneOpen, setHygieneOpen] = useState(false);
  const [createPrOpen, setCreatePrOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<GitConfirmRequest | null>(null);

  useEffect(() => {
    openTab(projectId);
  }, [openTab, projectId]);

  const panelIds = useMemo(() => {
    const ids: string[] = [];

    if (refsOpen) ids.push("refs");

    ids.push("graph");

    if (inspectorOpen) ids.push("inspector");

    return ids;
  }, [inspectorOpen, refsOpen]);

  const layout = useDefaultLayout({
    id: `aven.git-center.panels.${panelIds.join("-")}`,
    panelIds,
    storage: safeStorage,
  });

  const graph = useMemo(
    () => (center.snapshot ? buildGraphRows(center.snapshot) : { rows: [], lanes: 1 }),
    [center.snapshot],
  );
  const hygiene = useMemo(
    () =>
      center.snapshot
        ? computeHygiene(center.snapshot)
        : { mergedBranches: [], goneBranches: [], removableWorktrees: [], totalCount: 0 },
    [center.snapshot],
  );

  const selectProject = (id: string) => {
    openTab(id);
    void navigate({ to: "/git/$projectId", params: { projectId: id } });
  };

  if (center.loading && !center.snapshot) {
    return (
      <div className="flex h-[calc(100svh-var(--mobile-chrome))] min-w-0 flex-col overflow-hidden bg-background md:h-svh md:border md:border-foreground/12">
        <GitTabBar
          projects={projects ?? []}
          activeProjectId={projectId}
          tabIds={tabIds}
          mode="readonly"
          modeReason="ok"
          onSelectProject={selectProject}
          onCloseTab={closeTab}
        />
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <Skeleton className="h-full w-56" />
          <Skeleton className="h-full flex-1" />
          <Skeleton className="h-full w-96" />
        </div>
      </div>
    );
  }

  if (!center.snapshot) {
    return (
      <div className="flex h-[calc(100svh-var(--mobile-chrome))] min-w-0 flex-col overflow-hidden bg-background md:h-svh md:border md:border-foreground/12">
        <GitTabBar
          projects={projects ?? []}
          activeProjectId={projectId}
          tabIds={tabIds}
          mode="readonly"
          modeReason="runner_offline"
          onSelectProject={selectProject}
          onCloseTab={closeTab}
        />
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {center.error ?? "Could not load repository."}
        </div>
      </div>
    );
  }

  const snapshot = center.snapshot;
  const isLive = snapshot.mode === "live";

  const refsPane = (
    <GitRefsSidebar
      snapshot={snapshot}
      target={center.target}
      inspector={center.inspector}
      branchFilter={center.filters.branch}
      onSelectTarget={(nextTarget) => {
        center.setTarget(nextTarget);

        if (!inspectorOpen) setInspectorOpen(true);
      }}
      onSelectInspector={(nextInspector) => {
        center.setInspector(nextInspector);

        if (!inspectorOpen) setInspectorOpen(true);
      }}
      onFilterBranch={(branch) => center.setFilters((prev) => ({ ...prev, branch }))}
      onAction={(action) => void center.runAction(action)}
      onRenameBranch={(name) => setRenameBranch(name)}
      onConfirmDeleteBranch={(name, deleteRemote) =>
        setConfirmRequest({
          title: deleteRemote ? `Delete remote branch origin/${name}?` : `Delete branch ${name}?`,
          description: deleteRemote
            ? `This removes origin/${name} from the remote repository.`
            : `Delete local branch ${name}. You can recover its tip via Reflog if needed.`,
          confirmLabel: "Delete branch",
          action: { op: "branch.delete", name, deleteRemote },
          target: center.target,
        })
      }
      onStartThreadFromRef={(ref) => void center.handoff({ kind: "start_from_ref", ref })}
    />
  );

  const graphPane = (
    <GitGraphPane
      rows={graph.rows}
      lanes={graph.lanes}
      isLive={isLive}
      hasMore={snapshot.hasMore}
      loadingMore={center.loadingMore}
      filters={center.filters}
      inspector={center.inspector}
      target={center.target}
      onChangeFilters={center.setFilters}
      onSelectTarget={(nextTarget) => {
        center.setTarget(nextTarget);

        if (!inspectorOpen) setInspectorOpen(true);
      }}
      onSelectInspector={(nextInspector) => {
        center.setInspector(nextInspector);

        if (!inspectorOpen) setInspectorOpen(true);
      }}
      onLoadMore={center.loadMore}
      onAction={(action) => void center.runAction(action)}
      onCreateBranchFrom={(sha) => setCreateBranchState({ open: true, startPoint: sha })}
      onConfirmReset={(sha, mode) =>
        setConfirmRequest({
          title: `Reset (${mode}) to ${sha.slice(0, 7)}?`,
          description:
            mode === "hard"
              ? "Hard reset discards all uncommitted tracked changes and moves the branch pointer."
              : `Move the current branch pointer to ${sha.slice(0, 7)} using --${mode}.`,
          confirmLabel: `Reset (${mode})`,
          action: { op: "reset", ref: sha, mode },
          target: center.target,
        })
      }
      onStartThreadFromRef={(ref) => void center.handoff({ kind: "start_from_ref", ref })}
    />
  );

  const inspectorPane = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      {center.inspector.kind === "wip" && (
        <GitWipInspector
          workspace={center.workspace}
          loading={center.workspaceLoading}
          isLive={isLive}
          busyAction={center.busyAction}
          selectedFile={center.selectedFile}
          onSelectFile={center.setSelectedFile}
          onAction={(action) => center.runAction(action)}
          onConfirmDiscard={(paths) =>
            setConfirmRequest({
              title: `Discard changes in ${paths.length} file(s)?`,
              description: `This permanently reverts unstaged changes in: ${paths.join(", ")}`,
              confirmLabel: "Discard changes",
              action: { op: "discard", paths },
              target: center.target,
            })
          }
          onResolveConflictsWithAgent={(operation, files, threadId) =>
            void center.handoff({ kind: "resolve_conflicts", operation, files, threadId })
          }
        />
      )}

      {center.inspector.kind === "commit" && (
        <GitCommitInspector
          commit={center.commitDetail}
          loading={center.commitLoading}
          isLive={isLive}
          busyAction={center.busyAction}
          onSelectCommit={(sha) => center.setInspector({ kind: "commit", sha })}
          onAction={(action) => void center.runAction(action)}
          onCreateBranchFrom={(sha) => setCreateBranchState({ open: true, startPoint: sha })}
          onStartThreadFromRef={(ref) => void center.handoff({ kind: "start_from_ref", ref })}
        />
      )}

      {center.inspector.kind === "pr" && (
        <GitPrInspector
          data={pr.data}
          loading={pr.loading}
          busy={pr.busy}
          logsByCheck={pr.logsByCheck}
          loadingCheckId={pr.loadingCheckId}
          onLoadCheckLogs={pr.loadCheckLogs}
          onReview={pr.review}
          onMerge={pr.merge}
          onUpdateBranch={pr.updateBranch}
          onSetState={pr.setState}
          onFixCiWithAgent={(pullNumber, branch, checkName, logSnippet) =>
            void center.handoff({ kind: "fix_ci", pullNumber, branch, checkName, logSnippet })
          }
        />
      )}
    </section>
  );

  return (
    <div className="flex h-[calc(100svh-var(--mobile-chrome))] min-w-0 flex-col overflow-hidden bg-background md:h-svh md:border md:border-foreground/12">
      <GitTabBar
        projects={projects ?? []}
        activeProjectId={projectId}
        tabIds={tabIds}
        mode={snapshot.mode}
        modeReason={snapshot.modeReason}
        refsOpen={refsOpen}
        inspectorOpen={inspectorOpen}
        onToggleRefs={() => setRefsOpen((open) => !open)}
        onToggleInspector={() => setInspectorOpen((open) => !open)}
        onSelectProject={selectProject}
        onCloseTab={closeTab}
      />

      <GitToolbar
        snapshot={snapshot}
        target={center.target}
        refreshing={center.refreshing}
        busyAction={center.busyAction}
        hygieneCount={hygiene.totalCount}
        onRefresh={center.refresh}
        onAction={(action) => void center.runAction(action)}
        onForcePush={() =>
          setConfirmRequest({
            title: "Force push with lease?",
            description:
              "This will update the remote branch with --force-with-lease, rewriting remote history if no one else pushed new commits.",
            confirmLabel: "Force push",
            action: { op: "push", forceWithLease: true },
            target: center.target,
          })
        }
        onOpenCreateBranch={() => setCreateBranchState({ open: true })}
        onOpenStash={() => setStashOpen(true)}
        onOpenReflog={() => {
          setReflogOpen(true);
          void center.loadReflog();
        }}
        onOpenHygiene={() => setHygieneOpen(true)}
        onOpenCreatePr={() => setCreatePrOpen(true)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {wide ? (
          <ResizablePanelGroup
            key={panelIds.join("-")}
            orientation="horizontal"
            defaultLayout={layout.defaultLayout}
            onLayoutChanged={layout.onLayoutChanged}
          >
            {refsOpen && (
              <>
                <ResizablePanel id="refs" defaultSize="20" minSize="14" maxSize="36">
                  {refsPane}
                </ResizablePanel>
                <ResizableHandle withHandle className={HANDLE_CLASS} />
              </>
            )}

            <ResizablePanel id="graph" defaultSize="46" minSize="26">
              {graphPane}
            </ResizablePanel>

            {inspectorOpen && (
              <>
                <ResizableHandle withHandle className={HANDLE_CLASS} />
                <ResizablePanel id="inspector" defaultSize="34" minSize="22" maxSize="58">
                  {inspectorPane}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">{graphPane}</div>
            {inspectorOpen && (
              <div className="h-[46%] shrink-0 overflow-hidden border-t border-border/70">
                {inspectorPane}
              </div>
            )}
          </div>
        )}
      </div>

      <CreateBranchDialog
        open={createBranchState.open}
        startPoint={createBranchState.startPoint}
        onOpenChange={(open) => setCreateBranchState((prev) => ({ ...prev, open }))}
        onSubmit={(name, checkout, startPoint) =>
          void center.runAction({ op: "branch.create", name, checkout, startPoint })
        }
      />

      <RenameBranchDialog
        branchName={renameBranch}
        onOpenChange={(open) => !open && setRenameBranch(null)}
        onSubmit={(oldName, newName) =>
          void center.runAction({ op: "branch.rename", oldName, newName })
        }
      />

      <StashDialog
        open={stashOpen}
        onOpenChange={setStashOpen}
        onSubmit={(message, includeUntracked) =>
          void center.runAction({
            op: "stash.push",
            message: message || undefined,
            includeUntracked,
          })
        }
      />

      <CreatePrDialog
        open={createPrOpen}
        defaultHead={snapshot.headBranch ?? ""}
        defaultBase={snapshot.defaultBranch ?? "main"}
        onOpenChange={setCreatePrOpen}
        onSubmit={async (input) => {
          const created = await pr.createPull(input);

          if (created) center.setInspector({ kind: "pr", number: created.number });
        }}
      />

      <ReflogDialog
        open={reflogOpen}
        entries={center.reflog}
        loading={center.reflogLoading}
        onOpenChange={setReflogOpen}
        onCreateBranch={(sha) => setCreateBranchState({ open: true, startPoint: sha })}
        onRestore={(selector, sha) =>
          setConfirmRequest({
            title: `Restore HEAD to ${selector} (${sha.slice(0, 7)})?`,
            description:
              "This resets the current branch pointer to the selected reflog entry using --mixed, preserving working tree files.",
            confirmLabel: "Restore state",
            action: { op: "reset", ref: sha, mode: "mixed" },
            target: center.target,
          })
        }
      />

      <HygieneDialog
        open={hygieneOpen}
        hygiene={hygiene}
        onOpenChange={setHygieneOpen}
        onRunAction={(action) => center.runAction(action, { kind: "project" })}
      />

      <ConfirmGitActionDialog
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
        onConfirm={(req) => void center.runAction(req.action, req.target)}
      />
    </div>
  );
}
