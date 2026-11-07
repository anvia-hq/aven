import { Folder, GitBranch, Servers } from "@mynaui/icons-react";
import { threadBranch } from "@aven/protocol/thread-branch";

import { useProject } from "@/modules/projects/hooks/use-project";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { runtimeLabel } from "@/modules/runtimes/runtime-label";
import { ContinueThreadDialog } from "@/modules/threads/components/continue-thread-dialog";
import type { Thread } from "@/modules/threads/types";

import { OverviewCard } from "./overview-card";

// Where the thread's agent works: the runner, the repository and the branch it commits to, and for
// its creator a way to continue it on another runner (decision 0149).
export function EnvironmentCard({ thread, owned }: { thread: Thread; owned: boolean }) {
  const { project } = useProject(thread.projectId);
  const { runtime } = useRuntime(thread.runtimeId);

  return (
    <OverviewCard title="Environment">
      <Row icon={<Servers />}>{runtime ? runtimeLabel(runtime) : "Runner revoked"}</Row>
      {project && (
        <Row icon={<Folder />}>
          {project.name} <span className="text-muted-foreground">· {project.repoFullName}</span>
        </Row>
      )}
      <Row icon={<GitBranch />}>{threadBranch(thread.id)}</Row>
      {owned && thread.state !== "archived" && <ContinueThreadDialog thread={thread} />}
    </OverviewCard>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex min-w-0 items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}
