import { atomWithStorage } from "jotai/utils";

import { DEFAULT_THEME, THEME_STORAGE_KEY } from "../catalog";
import type { Theme } from "../types";

export const themeAtom = atomWithStorage<Theme>(THEME_STORAGE_KEY, DEFAULT_THEME);
