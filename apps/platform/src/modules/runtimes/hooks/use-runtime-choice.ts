import { useState } from "react";

import type { Project } from "@/modules/projects/types";

import { defaultRuntimeId, runtimeChoices } from "../choice";
import { useRuntimes } from "./use-runtimes";

export function useRuntimeChoice(project: Project | undefined) {
  const { runtimes, loaded } = useRuntimes({ poll: true });
  const [chosen, setChosen] = useState<{ projectId: string; runtimeId: string } | null>(null);
  const choices = runtimeChoices(project, runtimes);
  const picked =
    project && chosen?.projectId === project.id
      ? choices.find((choice) => choice.runtime.id === chosen.runtimeId && !choice.disabled)
      : undefined;

  return {
    loaded,
    choices,
    runtimeId: picked?.runtime.id ?? defaultRuntimeId(project, runtimes),
    choose: (runtimeId: string) => project && setChosen({ projectId: project.id, runtimeId }),
  };
}
