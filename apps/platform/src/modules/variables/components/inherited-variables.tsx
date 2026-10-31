import { Badge } from "@/components/badge";

import { useVariables } from "../hooks/use-variables";

// The names a project's threads get from elsewhere (decision 0046), so a value set in the
// workspace or by the person is not a surprise: each with where it comes from, and a note when the
// project's own, or the person's, replaces it.
export function InheritedVariables({ projectId }: { projectId: string }) {
  const project = useVariables({ kind: "project", projectId });
  const workspace = useVariables({ kind: "workspace" });
  const personal = useVariables({ kind: "personal" });

  if (!project.loaded || !workspace.loaded || !personal.loaded) return null;

  const own = new Set(personal.variables.map((variable) => variable.name));
  const inProject = new Set(project.variables.map((variable) => variable.name));
  const rows = [
    ...personal.variables.map((variable) => ({ name: variable.name, from: "You" })),
    ...workspace.variables.map((variable) => ({ name: variable.name, from: "Workspace" })),
  ]
    // A name set in more than one place is shown once, where it wins.
    .filter((row, index, all) => all.findIndex((other) => other.name === row.name) === index);
  if (rows.length === 0) return null;

  return (
    <section aria-label="Inherited variables" className="flex flex-col gap-2">
      <h2 className="text-sm text-muted-foreground">Also set for these threads</h2>
      <ul className="flex flex-col border-t">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 border-b py-2 text-sm">
            <span className="font-mono font-medium">{row.name}</span>
            <Badge variant="secondary">{row.from}</Badge>
            {row.from === "Workspace" && own.has(row.name) && (
              <span className="text-xs text-muted-foreground">replaced by yours</span>
            )}
            {row.from === "Workspace" && !own.has(row.name) && inProject.has(row.name) && (
              <span className="text-xs text-muted-foreground">replaced by the project's</span>
            )}
            {row.from === "You" && inProject.has(row.name) && (
              <span className="text-xs text-muted-foreground">replaces the project's</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
