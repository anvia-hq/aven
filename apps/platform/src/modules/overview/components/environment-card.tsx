import { Cloud, Folder, GitBranch, Github, Monitor } from "@mynaui/icons-react";
import type { ReactNode } from "react";
import { threadBranch } from "@aven/protocol/thread-branch";

import { threadComputer } from "@/modules/computer/computer";
import { useComputerStatus } from "@/modules/computer/hooks/use-computer-status";
import { useProject } from "@/modules/projects/hooks/use-project";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { isSandbox } from "@/modules/runtimes/sandbox";
import { githubIdentityNote } from "@/modules/threads/github-identity";
import { useShipReadiness } from "@/modules/threads/hooks/use-ship-readiness";
import { ContinueThreadDialog } from "@/modules/threads/components/continue-thread-dialog";
import type { Thread } from "@/modules/threads/types";

import { OverviewCard } from "./overview-card";
import { projectPlace } from "@/modules/projects/place";

export function EnvironmentCard({ thread, owned }: { thread: Thread; owned: boolean }) {
  const { project } = useProject(thread.projectId);
  const { runtime, loaded } = useRuntime(thread.runtimeId);
  const { runtimes } = useRuntimes();
  const cloud = runtimes.find((candidate) => candidate.isCloud);
  const sandbox = isSandbox(runtime) || (!runtime && Boolean(cloud));
  const name = runtime?.name ?? (sandbox ? cloud?.name : undefined);
  const { status } = useComputerStatus(threadComputer(thread.id));
  const { githubMode, runnerGithub } = useShipReadiness(thread.id, thread.running);
  const github = githubIdentityNote(runnerGithub, githubMode);
  const starting = sandbox && status?.available === true && status.state !== "awake";

  return (
    <OverviewCard title="Environment">
      <div className="flex flex-wrap gap-1.5">
        <Row
          icon={
            sandbox ? (
              <Cloud aria-label={starting ? "Starting" : "Aven Cloud"} />
            ) : (
              <Monitor aria-label={runtime?.online ? "Online" : "Offline"} />
            )
          }
          action={
            owned && thread.state !== "archived" ? <ContinueThreadDialog thread={thread} /> : null
          }
        >
          {name ?? (loaded ? "Runner revoked" : "…")}
          {starting && <span className="text-muted-foreground"> · starting</span>}
        </Row>
        {project && (
          <Row icon={<Folder />}>
            {project.name} <span className="text-muted-foreground">· {projectPlace(project)}</span>
          </Row>
        )}
        <Row icon={<GitBranch />}>{threadBranch(thread.id)}</Row>
        {github && (
          <Row icon={<Github />}>
            <span title={github.detail}>{github.label}</span>
          </Row>
        )}
      </div>
    </OverviewCard>
  );
}

function Row({
  icon,
  action,
  children,
}: {
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <p className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-muted/40 py-1 pr-3 pl-2.5 text-xs [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </p>
  );
}
