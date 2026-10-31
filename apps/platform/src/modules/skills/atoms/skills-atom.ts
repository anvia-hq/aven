import { atom } from "jotai";

import type { BuiltinSkill, Skill } from "../types";

// The signed-in user's skills as last fetched from the API. Null until the first load.
export const skillsAtom = atom<Skill[] | null>(null);

// The skills every user has. Null until the first load.
export const builtinSkillsAtom = atom<BuiltinSkill[] | null>(null);
