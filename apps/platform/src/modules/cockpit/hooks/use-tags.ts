import { getDefaultStore } from "jotai";
import { useMemo } from "react";

import { attempt, postJson } from "@/lib/api";
import { paletteColor } from "@/modules/bots/avatar";

import { cockpitTagsAtom } from "../atoms/cockpit-atoms";
import type { CockpitTag } from "../types";
import { refreshCockpitTags, useCockpitTags } from "./use-collection";

const store = getDefaultStore();

/** The color a tag is drawn in: the one the person chose, else the one its name picks (decision 0107). */
export function useTagColors() {
  const tags = useCockpitTags();
  return useMemo(() => {
    const chosen = new Map(tags.map((tag) => [tag.name, tag.color]));
    return (name: string) => chosen.get(name) ?? paletteColor(name);
  }, [tags]);
}

// The person's tags, which they add before using and give colors (decision 0107).
export function useTags() {
  const tags = useCockpitTags();
  return {
    tags,
    async add(name: string) {
      const made = await attempt("Could not add the tag", () =>
        postJson<CockpitTag>("/cockpit/tags", { name }),
      );
      if (made) await refreshCockpitTags();
      return made;
    },
    /** A color of `#rrggbb`, or null for the one the name picks. Shown at once. */
    async setColor(name: string, color: string | null) {
      const before = store.get(cockpitTagsAtom);
      if (before) {
        store.set(
          cockpitTagsAtom,
          before.map((tag) => (tag.name === name ? { ...tag, color } : tag)),
        );
      }
      const saved = await attempt("Could not change the color", () =>
        postJson<CockpitTag>(`/cockpit/tags/${encodeURIComponent(name)}`, { color }, "PATCH"),
      );
      if (!saved) await refreshCockpitTags();
      return Boolean(saved);
    },
  };
}
