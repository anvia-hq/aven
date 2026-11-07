import { useMemo } from "react";

import { tilePalettes } from "../tile";
import { useProjects } from "./use-projects";

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
