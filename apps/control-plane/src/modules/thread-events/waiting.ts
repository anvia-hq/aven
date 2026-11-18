import type { ThreadEventNotes } from "./event-notes";
import type { BotThreadDetail } from "@aven/protocol/types";

export function createWaitingEvents(options: {
  thread(id: string): Promise<{ createdBy: string; state: string } | null>;
  look(userId: string, id: string): Promise<BotThreadDetail>;
  notes: Pick<ThreadEventNotes, "offer">;
}) {
  const { thread, look, notes } = options;
  return {
    async waiting(threadId: string, run: number) {
      const row = await thread(threadId);

      if (!row || row.state === "archived") return;

      const seen = await look(row.createdBy, threadId);

      if (!seen.awaitingAnswer || !seen.mine) return;

      await notes.offer(row.createdBy, {
        kind: "waiting",
        thread: { id: seen.id, title: seen.title, repository: seen.repository },
        run,
        question: seen.question,
      });
    },
  };
}
