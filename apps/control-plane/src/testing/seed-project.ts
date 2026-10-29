import { db } from "@aven/db/client";
import { githubInstallations } from "@aven/db/schema/github-installations";
import { projects } from "@aven/db/schema/projects";

// Inserts a GitHub installation and a project imported from it, without calling GitHub.
export async function seedProject(
  organizationId: string,
  userId: string,
  runtimeId: string,
  name = "proj",
) {
  const [installation] = await db
    .insert(githubInstallations)
    .values({
      organizationId,
      connectedBy: userId,
      installationId: Math.floor(Math.random() * 1e9),
      accountLogin: "acme",
    })
    .returning();
  const [project] = await db
    .insert(projects)
    .values({
      organizationId,
      createdBy: userId,
      runtimeId,
      githubInstallationId: installation!.id,
      repoFullName: `acme/${name}`,
      cloneUrl: `https://github.com/acme/${name}.git`,
      defaultBranch: "main",
      name,
    })
    .returning();
  return { installation: installation!, project: project! };
}
