import { atomWithStorage } from "jotai/utils";

import { INHERIT_FONT, SCOPED_FONT_STORAGE_KEYS, type FontChoice, type FontScope } from "../types";

export const scopedFontAtoms = {
  thread: atomWithStorage<FontChoice>(SCOPED_FONT_STORAGE_KEYS.thread, INHERIT_FONT),
  bot: atomWithStorage<FontChoice>(SCOPED_FONT_STORAGE_KEYS.bot, INHERIT_FONT),
} satisfies Record<FontScope, unknown>;
