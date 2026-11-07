import { atom } from "jotai";

import type { BuiltinSkill, Skill } from "../types";

export const skillsAtom = atom<Skill[] | null>(null);

export const builtinSkillsAtom = atom<BuiltinSkill[] | null>(null);
