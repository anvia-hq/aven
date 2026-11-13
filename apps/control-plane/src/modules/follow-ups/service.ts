import { lastSubmission } from "@aven/protocol/submitter";

import { agentReply, followUpTranscript } from "./transcript";
import type { FollowUpViewer, FollowUpsDeps } from "./types";

export const createFollowUps = ({ messagesOf, worthSuggesting, suggest }: FollowUpsDeps) => ({
  async forThread(viewer: FollowUpViewer, threadId: string) {
    const messages = await messagesOf(viewer, threadId);
    const sender = lastSubmission(messages)?.senderId;

    if (sender !== undefined && sender !== viewer.userId) return { suggestions: [] as string[] };

    const transcript = followUpTranscript(messages);

    if (transcript === undefined) return { suggestions: [] as string[] };

    if (!(await worthSuggesting(viewer.organizationId, agentReply(messages), transcript))) {
      return { suggestions: [] as string[] };
    }

    return { suggestions: await suggest(viewer.userId, transcript) };
  },
});
