import { atom } from "jotai";

import type { CockpitNote, CockpitTag, CockpitTask, InboxItem } from "../types";

// The signed-in person's cockpit as last fetched (decision 0104). Null until the first load.
export const inboxAtom = atom<InboxItem[] | null>(null);
export const tasksAtom = atom<CockpitTask[] | null>(null);
export const notesAtom = atom<CockpitNote[] | null>(null);
export const cockpitTagsAtom = atom<CockpitTag[] | null>(null);
