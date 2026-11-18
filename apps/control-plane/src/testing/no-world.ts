import type { BotWorldKeeper } from "../modules/bots/types";

export const noWorld: BotWorldKeeper = {
  forReply: async () => ({ context: "", projects: [] }),
  folder: async () => [],
  file: async () => ({ path: "", text: "", truncated: false }),
};
