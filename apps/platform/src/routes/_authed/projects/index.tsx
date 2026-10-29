import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { NewProjectDialog } from "@/modules/projects/components/new-project-dialog";
import { ProjectGrid } from "@/modules/projects/components/project-grid";

export const Route = createFileRoute("/_authed/projects/")({
  component: Projects,
});

function Projects() {
  return (
    <main className="flex w-full flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title="Projects"
        description="Where threads run: each project is a name and a runner."
        actions={<NewProjectDialog />}
      />
      <ProjectGrid />
    </main>
  );
}
