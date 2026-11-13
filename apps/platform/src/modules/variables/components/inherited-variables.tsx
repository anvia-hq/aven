import { cn } from "cn";

import { Badge } from "@aven/ui/badge";
import { SectionCard } from "@/components/section-card";

import { useVariables } from "../hooks/use-variables";

export function InheritedVariables({
  projectId,
  framed = false,
}: {
  projectId: string;
  framed?: boolean;
}) {
  const project = useVariables({ kind: "project", projectId });
  const workspace = useVariables({ kind: "workspace" });
  const personal = useVariables({ kind: "personal" });

  if (!project.loaded || !workspace.loaded || !personal.loaded) return null;

  const own = new Set(personal.variables.map((variable) => variable.name));
  const inProject = new Set(project.variables.map((variable) => variable.name));
  const rows = [
    ...personal.variables.map((variable) => ({ name: variable.name, from: "You" })),
    ...workspace.variables.map((variable) => ({ name: variable.name, from: "Workspace" })),
  ].filter((row, index, all) => all.findIndex((other) => other.name === row.name) === index);

  if (rows.length === 0) return null;

  const title = "Also set for these threads";
  const list = (
    <ul className={cn("flex flex-col", framed ? "px-4 [&>li:last-child]:border-b-0" : "border-t")}>
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
  );

  if (framed) {
    return (
      <SectionCard title={title} label="Inherited variables">
        {list}
      </SectionCard>
    );
  }

  return (
    <section aria-label="Inherited variables" className="flex flex-col gap-2">
      <h2 className="text-sm text-muted-foreground">{title}</h2>
      {list}
    </section>
  );
}
