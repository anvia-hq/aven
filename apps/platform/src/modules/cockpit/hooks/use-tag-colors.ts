import { useMemo } from "react";

import { paletteColor } from "@/modules/bots/avatar";

import { useCockpitTags } from "./use-collection";

export function useTagColors() {
  const tags = useCockpitTags();
  return useMemo(() => {
    const chosen = new Map(tags.map((tag) => [tag.name, tag.color]));
    return (name: string) => chosen.get(name) ?? paletteColor(name);
  }, [tags]);
}
