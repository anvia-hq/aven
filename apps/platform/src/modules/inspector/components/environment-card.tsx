import { Folder, GitBranch, Servers } from "@mynaui/icons-react";
import { threadBranch } from "@aven/protocol/thread-branch";

import { useProjects } from "@/modules/projects/hooks/use-projects";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import type { Thread } from "@/modules/threads/types";

import { InspectorCard } from "./inspector-card";

// Where the thread's agent works: the runner, the repository and the branch it commits to.
export function EnvironmentCard({ thread }: { thread: Thread }) {
  const { projects } = useProjects();
  const { runtimes } = useRuntimes();
  const project = projects.find((candidate) => candidate.id === thread.projectId);
  const runtime = runtimes.find((candidate) => candidate.id === thread.runtimeId);

  return (
    <InspectorCard title="Environment">
      <Row icon={<Servers />}>
        {runtime ? `${runtime.name} · ${runtime.online ? "online" : "offline"}` : "Runner revoked"}
      </Row>
      {project && (
        <Row icon={<Folder />}>
          {project.name} <span className="text-muted-foreground">· {project.repoFullName}</span>
        </Row>
      )}
      <Row icon={<GitBranch />}>{threadBranch(thread.id)}</Row>
    </InspectorCard>
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
