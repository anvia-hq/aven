import { atom } from "jotai";

import type { PlatformConfig } from "../types";

// The platform's settings and whether the signed-in user owns it. Null until the first load.
export const platformConfigAtom = atom<PlatformConfig | null>(null);
