import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { ImportRepositoryDialog } from "@/modules/projects/components/import-repository-dialog";
import { ProjectGrid } from "@/modules/projects/components/project-grid";

export const Route = createFileRoute("/_authed/projects/")({
  component: Projects,
});

function Projects() {
  return (
    <main className="flex w-full flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title="Projects"
        description="Where threads run: each project is an imported GitHub repository and the runner that hosts its sandboxes."
        actions={<ImportRepositoryDialog />}
      />
      <ProjectGrid />
    </main>
  );
}
