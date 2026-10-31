import { useAtomValue } from "jotai";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";

// What each bot said last, by bot id, as far as the chats opened so far told.
export function useBotLastMessages() {
  return useAtomValue(botLastMessagesAtom);
}
