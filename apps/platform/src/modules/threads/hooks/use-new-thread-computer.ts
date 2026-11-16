import { useState } from "react";

import { defaultRuntimeId, runtimeChoices } from "@/modules/runtimes/choice";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

const anywhere = { runtimeId: null, directory: null };

export function useNewThreadComputer() {
  const { runtimes, loaded } = useRuntimes({ poll: true });
  const [runtimeId, setRuntimeId] = useState<string | undefined>(undefined);
  const choices = runtimeChoices(anywhere, runtimes);
  const picked = choices.find((choice) => choice.runtime.id === runtimeId && !choice.disabled);
  const computerId = picked?.runtime.id ?? defaultRuntimeId(anywhere, runtimes);

  return {
    loaded,
    choices,
    runtimeId: computerId,
    runtime: choices.find((choice) => choice.runtime.id === computerId)?.runtime,
    choose: setRuntimeId,
  };
}
