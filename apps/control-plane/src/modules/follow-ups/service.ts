import { agentReply, followUpTranscript } from "./transcript";
import type { FollowUpViewer, FollowUpsDeps } from "./types";

export const createFollowUps = ({ messagesOf, worthSuggesting, suggest }: FollowUpsDeps) => ({
  async forThread(viewer: FollowUpViewer, threadId: string) {
    const messages = await messagesOf(viewer, threadId);
    const transcript = followUpTranscript(messages);

    if (transcript === undefined) return { suggestions: [] as string[] };

    if (!(await worthSuggesting(viewer.organizationId, agentReply(messages), transcript))) {
      return { suggestions: [] as string[] };
    }

    return { suggestions: await suggest(viewer.userId, transcript) };
  },
});
