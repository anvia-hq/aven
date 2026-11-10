import { Camera, Folder, GitBranch, Servers } from "@mynaui/icons-react";
import { threadBranch } from "@aven/protocol/thread-branch";

import { Button } from "@/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { shortTimeAgo } from "@/lib/format";
import { useProject } from "@/modules/projects/hooks/use-project";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { ContinueThreadDialog } from "@/modules/threads/components/continue-thread-dialog";
import type { Thread } from "@/modules/threads/types";

import type { SnapshotState } from "../types";
import { useEnvironmentSnapshot } from "../hooks/use-environment-snapshot";
import { OverviewCard } from "./overview-card";

export function EnvironmentCard({
  thread,
  owned,
  saves,
}: {
  thread: Thread;
  owned: boolean;
  saves: number;
}) {
  const { project } = useProject(thread.projectId);
  const { runtime } = useRuntime(thread.runtimeId);
  const { loaded, snapshot, busy, take } = useEnvironmentSnapshot(thread.id, saves);
  const canSnapshot = owned && thread.state !== "archived";

  return (
    <OverviewCard title="Environment">
      <Row
        icon={
          <Servers
            aria-label={runtime?.online ? "Online" : "Offline"}
            className={runtime?.online ? "text-success!" : undefined}
          />
        }
        action={
          owned && thread.state !== "archived" ? <ContinueThreadDialog thread={thread} /> : null
        }
      >
        {runtime ? runtime.name : "Runner revoked"}
      </Row>
      {project && (
        <Row icon={<Folder />}>
          {project.name} <span className="text-muted-foreground">· {project.repoFullName}</span>
        </Row>
      )}
      <Row icon={<GitBranch />}>{threadBranch(thread.id)}</Row>
      {canSnapshot && (
        <>
          <Row icon={<Camera />}>
            <span className="text-muted-foreground" data-slot="snapshot-state">
              {loaded ? snapshotLine(snapshot) : "Checking for a snapshot…"}
            </span>
          </Row>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="xs"
                  className="w-fit"
                  disabled={!loaded || busy || !runtime?.online}
                  onClick={() => void take()}
                />
              }
            >
              {busy ? "Taking…" : "Take snapshot"}
            </TooltipTrigger>
            <TooltipContent>
              Run .aven/setup in a fresh container and keep the result for new threads
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </OverviewCard>
  );
}

function Row({
  icon,
  action,
  children,
}: {
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex min-w-0 items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </p>
  );
}

function snapshotLine(snapshot: SnapshotState | null) {
  if (snapshot?.state === "running") return "Taking a snapshot…";
  if (snapshot?.savedAt) {
    const ago = shortTimeAgo(snapshot.savedAt);
    return ago === "now" ? "Snapshot just now" : `Snapshot ${ago} ago`;
  }
  return "No snapshot yet";
}
