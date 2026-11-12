import type { ChatMessage } from "@aven/protocol/types";

export type FollowUpViewer = { organizationId: string; userId: string };

export type FollowUpsDeps = {
  messagesOf(viewer: FollowUpViewer, threadId: string): Promise<readonly ChatMessage[]>;
  worthSuggesting(organizationId: string, reply: string, transcript: string): Promise<boolean>;
  suggest(userId: string, transcript: string): Promise<string[]>;
};
