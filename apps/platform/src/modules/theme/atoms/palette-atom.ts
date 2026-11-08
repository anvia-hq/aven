import { atomWithStorage } from "jotai/utils";

import { DEFAULT_PALETTE, PALETTE_STORAGE_KEY, type Palette } from "../types";

export const paletteAtom = atomWithStorage<Palette>(PALETTE_STORAGE_KEY, DEFAULT_PALETTE);
