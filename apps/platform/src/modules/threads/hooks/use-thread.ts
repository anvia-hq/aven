import { useAtomValue } from "jotai";

import { threadsAtom } from "../atoms/threads-atom";

export function useThread(threadId: string) {
  return useAtomValue(threadsAtom).find((thread) => thread.id === threadId);
}
