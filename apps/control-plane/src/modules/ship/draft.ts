import type { CompletionModel } from "@anvia/core";
import { createModel } from "@aven/agents/model";
import { draftPullRequest, type PullRequestText } from "@aven/agents/pull-request-text";

import { describeError } from "../../errors";
import { createDiffService } from "../diff/service";
import { resolveModel } from "../providers/resolve-model";
import type { RuntimeHub } from "../runtimes/hub";

// Writing the text is a nicety: past this the pull request goes out with the thread's own title.
const DRAFT_TIMEOUT_MS = 30_000;

type Thread = { id: string; title: string };

export type Drafter = (
  organizationId: string,
  userId: string,
  thread: Thread,
) => Promise<PullRequestText>;

type Sources = {
  /** The patch that will be shipped, or null when the runner cannot give one. */
  patch(organizationId: string, threadId: string): Promise<string | null>;
  /** The user's own model, or null when they have no provider. */
  model(userId: string): Promise<CompletionModel | null>;
};

// Drafts a pull request's title and description (decision 0040) with the shipper's own model, from
// the diff the runner holds. It never fails the ship: without a patch or a model, or when the
// model errors or is slow, the title is the thread's and the description a plain line.
export function createDrafter({ patch, model }: Sources): Drafter {
  return async (organizationId, userId, thread) => {
    const fallback = { title: thread.title, body: "Opened from an Aven thread." };
    try {
      const [diff, completion] = await Promise.all([
        patch(organizationId, thread.id),
        model(userId),
      ]);
      if (!diff || !completion) return fallback;
      return await draftPullRequest(
        completion,
        { intent: thread.title, patch: diff },
        fallback,
        AbortSignal.timeout(DRAFT_TIMEOUT_MS),
      );
    } catch (error) {
      console.warn("The pull request text was not drafted:", describeError(error));
      return fallback;
    }
  };
}

export function createRunnerDrafter(hub: RuntimeHub) {
  const diffs = createDiffService(hub);
  return createDrafter({
    async patch(organizationId, threadId) {
      const diff = await diffs.get(organizationId, threadId, "all");
      return diff.available ? diff.patch : null;
    },
    async model(userId) {
      const config = await resolveModel(userId);
      return config && createModel(config);
    },
  });
}
