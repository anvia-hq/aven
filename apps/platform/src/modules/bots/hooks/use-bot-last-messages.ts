import { useAtomValue } from "jotai";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";

export function useBotLastMessages() {
  return useAtomValue(botLastMessagesAtom);
}
