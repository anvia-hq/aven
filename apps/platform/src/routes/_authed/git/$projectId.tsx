import { createFileRoute } from "@tanstack/react-router";

import { GitCenterWorkspace } from "@/modules/git-center/components/git-center-workspace";

export const Route = createFileRoute("/_authed/git/$projectId")({
  component: GitCenterProjectPage,
});

function GitCenterProjectPage() {
  const { projectId } = Route.useParams();
  return <GitCenterWorkspace projectId={projectId} />;
}
