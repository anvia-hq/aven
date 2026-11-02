import { useMemo } from "react";

import { tilePalettes } from "../tile";
import { useProjects } from "./use-projects";

// The palette of each of the person's projects, by project id, so a project's tile is the same
// wherever it is drawn. Oldest first, so a project keeps its palette as newer ones arrive.
export function useProjectPalettes() {
  const { projects } = useProjects();
  return useMemo(
    () =>
      tilePalettes(
        [...projects]
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
          .map((project) => project.id),
      ),
    [projects],
  );
}
