import { Folder, GitBranch, Github, Servers } from "@mynaui/icons-react";
import { threadBranch } from "@aven/protocol/thread-branch";

import { useProject } from "@/modules/projects/hooks/use-project";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { githubIdentityNote } from "@/modules/threads/github-identity";
import { useShipReadiness } from "@/modules/threads/hooks/use-ship-readiness";
import { ContinueThreadDialog } from "@/modules/threads/components/continue-thread-dialog";
import type { Thread } from "@/modules/threads/types";

import { OverviewCard } from "./overview-card";
import { projectPlace } from "@/modules/projects/place";

export function EnvironmentCard({ thread, owned }: { thread: Thread; owned: boolean }) {
  const { project } = useProject(thread.projectId);
  const { runtime } = useRuntime(thread.runtimeId);
  const { githubMode, runnerGithub } = useShipReadiness(thread.id, thread.running);
  const github = githubIdentityNote(runnerGithub, githubMode);

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
          {project.name} <span className="text-muted-foreground">· {projectPlace(project)}</span>
        </Row>
      )}
      <Row icon={<GitBranch />}>{threadBranch(thread.id)}</Row>
      {github && (
        <Row icon={<Github />}>
          <span title={github.detail}>{github.label}</span>
        </Row>
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
