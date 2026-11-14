import { getDefaultStore } from "jotai";

import { attempt, postJson } from "@/lib/api";

import { cockpitTagsAtom } from "../atoms/cockpit-atoms";
import type { CockpitTag } from "../types";
import { refreshCockpitTags, useCockpitTags } from "./use-collection";

const store = getDefaultStore();

export function useTags() {
  const tags = useCockpitTags();
  return {
    tags,
    async add(name: string) {
      const made = await attempt("Could not add the tag", () =>
        postJson<CockpitTag>("/cockpit/tags", { name }),
      );
      const before = store.get(cockpitTagsAtom);

      if (made && before && !before.some((tag) => tag.name === made.name)) {
        store.set(cockpitTagsAtom, [...before, made]);
      }

      return made;
    },
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
      const now = store.get(cockpitTagsAtom);

      if (saved && now) {
        store.set(
          cockpitTagsAtom,
          now.map((tag) => (tag.name === name ? { ...tag, color: saved.color } : tag)),
        );
      }

      if (!saved) await refreshCockpitTags();

      return Boolean(saved);
    },
  };
}
