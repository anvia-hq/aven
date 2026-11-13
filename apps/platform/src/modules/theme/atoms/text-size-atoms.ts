import { atomWithStorage } from "jotai/utils";

import { DEFAULT_TEXT_SIZE, TEXT_SIZE_STORAGE_KEYS, type TextSize } from "../types";

export const textSizeAtoms = {
  interface: atomWithStorage<TextSize>(TEXT_SIZE_STORAGE_KEYS.interface, DEFAULT_TEXT_SIZE),
  thread: atomWithStorage<TextSize>(TEXT_SIZE_STORAGE_KEYS.thread, DEFAULT_TEXT_SIZE),
  bot: atomWithStorage<TextSize>(TEXT_SIZE_STORAGE_KEYS.bot, DEFAULT_TEXT_SIZE),
};
