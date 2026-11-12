import { atomWithStorage } from "jotai/utils";

export const dismissedAnnouncementsAtom = atomWithStorage<string[]>(
  "aven.announcements.dismissed",
  [],
);
