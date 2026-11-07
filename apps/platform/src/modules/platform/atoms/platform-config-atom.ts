import { atom } from "jotai";

import type { PlatformConfig } from "../types";

export const platformConfigAtom = atom<PlatformConfig | null>(null);
