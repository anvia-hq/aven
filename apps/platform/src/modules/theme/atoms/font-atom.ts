import { atomWithStorage } from "jotai/utils";

import { DEFAULT_FONT, FONT_STORAGE_KEY, type SansFont } from "../types";

export const fontAtom = atomWithStorage<SansFont>(FONT_STORAGE_KEY, DEFAULT_FONT);
