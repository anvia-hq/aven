import { z } from "zod";

import { ConflictError, describeError, UnavailableError } from "../../errors";
import type { RuntimeHub } from "./hub";

const answer = z.discriminatedUnion("status", [
  z.object({ status: z.literal("started") }),
  z.object({ status: z.literal("busy"), reason: z.string().max(500) }),
  z.object({ status: z.literal("unsupported") }),
]);

/** How long a runner has to agree: it answers before it starts, so this is quick. */
const AGREE_MS = 15_000;

// Has an online runner update itself to `release` (this server's, when it knows it), decision 0146.
// What the runner answers is parsed; a refusal becomes a 409 that says why.
export async function requestUpdate(
  hub: RuntimeHub,
  runtimeId: string,
  release: string | undefined,
) {
  const runner = hub.get(runtimeId);
  if (!runner) throw new UnavailableError("The runner is offline");
  if (!runner.canUpdate) {
    throw new ConflictError(
      "This runner was not installed with aven, so it cannot update itself: run aven update on its machine",
    );
  }
  // A runner that does not answer, or answers with something else, is as good as offline.
  const result = await runner
    .call("runner.update", { release }, AGREE_MS)
    .then((reply) => answer.parse(reply))
    .catch((error: unknown) => {
      console.warn(`Runner ${runtimeId} did not take runner.update:`, describeError(error));
      throw new UnavailableError("The runner did not answer the update");
    });
  if (result.status === "busy") throw new ConflictError(result.reason);
  if (result.status === "unsupported") {
    throw new ConflictError("This runner cannot update itself: run aven update on its machine");
  }
  return result;
}
