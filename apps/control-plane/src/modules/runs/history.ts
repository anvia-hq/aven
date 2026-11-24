import { messagesToChat } from "@aven/agents/projection";
import { usageFromHistory } from "@aven/agents/usage";
import { withSenders, withWorkedTimes } from "@aven/protocol/events";
import type { ContextSegment, PlanLimit, ToolNarration } from "@aven/protocol/types";

import type { ConversationStore } from "../../types";
import { withContextSplit } from "./context-split";
import type {
  ContextSplitStore,
  LimitStore,
  NarrationStore,
  RunThread,
  SenderStore,
  WorkedTimeStore,
} from "./types";

export class ThreadHistory {
  constructor(
    private store: ConversationStore,
    private workedTimes: WorkedTimeStore,
    private senders: SenderStore,
    private limits: LimitStore,
    private splits?: ContextSplitStore,
    private narrations?: NarrationStore,
  ) {}

  scope(thread: RunThread) {
    return { sessionId: thread.id, metadata: { organizationId: thread.organizationId } };
  }

  loadRaw(thread: RunThread) {
    return this.store.load({ scope: this.scope(thread) });
  }

  async loadMessages(thread: RunThread) {
    const [history, times, senders] = await Promise.all([
      this.loadRaw(thread),
      this.workedTimes.read(thread.id).catch(() => new Map<number, number>()),
      this.senders.read(thread.id).catch(() => new Map<number, string>()),
    ]);
    return withSenders(withWorkedTimes(messagesToChat(history), times), senders);
  }

  async loadState(thread: RunThread) {
    const [history, times, senders, stored, split, narrations] = await Promise.all([
      this.loadRaw(thread),
      this.workedTimes.read(thread.id).catch(() => new Map<number, number>()),
      this.senders.read(thread.id).catch(() => new Map<number, string>()),
      this.storedLimits(thread.id),
      this.storedSplit(thread.id),
      this.storedNarrations(thread.id),
    ]);
    return {
      messages: withSenders(withWorkedTimes(messagesToChat(history), times), senders),
      usage: {
        ...withContextSplit(usageFromHistory(history), split),
        limits: stored.length > 0 ? stored : undefined,
      },
      narrations,
    };
  }

  async appendNote(thread: RunThread, prompt: string, senderId?: string) {
    const at = senderId ? (await this.loadMessages(thread)).length : 0;
    await this.store.append({
      scope: this.scope(thread),
      runId: crypto.randomUUID(),
      turn: 0,
      messages: [{ role: "user", content: prompt }],
    });

    if (senderId) {
      await this.senders.record(thread.id, at, senderId).catch((error: unknown) => {
        console.warn(`Could not keep who sent a message of thread ${thread.id}:`, error);
      });
    }
  }

  recordSender(threadId: string, index: number, senderId: string | undefined) {
    if (!senderId) return;

    this.senders.record(threadId, index, senderId).catch((error: unknown) => {
      console.warn(`Could not keep who sent a message of thread ${threadId}:`, error);
    });
  }

  recordWorkedTime(threadId: string, index: number, workedMs: number) {
    this.workedTimes.record(threadId, index, workedMs).catch((error: unknown) => {
      console.warn(`Could not keep how long a run of thread ${threadId} took:`, error);
    });
  }

  recordSplit(threadId: string, usedTokens: number, segments: ContextSegment[]) {
    void this.splits?.record(threadId, { usedTokens, segments }).catch(() => undefined);
  }

  recordLimits(threadId: string, limits: readonly PlanLimit[]) {
    void this.limits.record(threadId, limits).catch(() => undefined);
  }

  recordNarration(threadId: string, narration: ToolNarration) {
    void this.narrations?.record(threadId, narration).catch(() => undefined);
  }

  private async storedNarrations(threadId: string): Promise<Record<string, ToolNarration>> {
    return (await this.narrations?.read(threadId).catch(() => ({}))) ?? {};
  }

  private async storedSplit(threadId: string) {
    return (await this.splits?.read(threadId).catch(() => null)) ?? null;
  }

  private async storedLimits(threadId: string) {
    const stored = await this.limits.read(threadId).catch(() => []);
    const now = Date.now();
    return stored.filter((limit) => limit.resetsAt === undefined || limit.resetsAt > now);
  }
}
