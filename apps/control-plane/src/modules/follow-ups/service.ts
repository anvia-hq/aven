import { followUpTranscript } from "./transcript";
import type { FollowUpViewer, FollowUpsDeps } from "./types";

export const createFollowUps = ({ messagesOf, suggest }: FollowUpsDeps) => ({
  async forThread(viewer: FollowUpViewer, threadId: string) {
    const transcript = followUpTranscript(await messagesOf(viewer, threadId));
    if (transcript === undefined) return { suggestions: [] as string[] };
    return { suggestions: await suggest(viewer.userId, transcript) };
  },
});
