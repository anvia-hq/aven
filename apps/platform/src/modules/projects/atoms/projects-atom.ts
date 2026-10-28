import { atom } from "jotai";

import type { Project } from "../types";

// The organization's projects as last fetched from the API. Null until the first load.
export const projectsAtom = atom<Project[] | null>(null);
