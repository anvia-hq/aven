import type { FileContent } from "@aven/protocol/runtime-wire";

import { UnprocessableError } from "../../errors";

/** Where a repository keeps its own way of shipping (decision 0044). */
export const SHIP_PROMPT_FILE = ".aven/ship.md";

/** A custom prompt may be this long, as in Amp. */
export const MAX_SHIP_PROMPT_CHARS = 10_000;

export class ShipPromptError extends UnprocessableError {}

type Context = { branch: string; base: string };

// What Ship asks the agent to do when the repository has no `.aven/ship.md`.
function defaultPrompt({ base }: Context) {
  return `Ship this thread's work as a pull request.

1. Look at git status and git diff. Commit everything that belongs to the work, with clear imperative commit messages. Do not commit secrets, .env files or build output.
2. Bring the branch up to date: git fetch origin ${base}, then rebase onto origin/${base}. Resolve conflicts if you can; if one needs a decision, ask me.
3. Run the project's checks (tests, lint, typecheck) the way its README, AGENTS.md or CI does, and fix what you broke. If something fails that you cannot fix, stop and tell me.
4. Push this branch with git push -u origin HEAD. Never force-push to ${base}.
5. Open a draft pull request into ${base} with gh pr create --draft, with a title and description that say what changed and why. If one is already open for this branch, the push updates it: do not open another.
6. Tell me the pull request's URL.`;
}

/**
 * The prompt a Ship sends the agent: the repository's own `.aven/ship.md` when it has one, else
 * Aven's default. A custom prompt is sent as it is, followed by where the thread is, so the agent
 * need not look it up. `file` is what the runner answered for `.aven/ship.md`.
 */
export function shipPrompt(file: FileContent | null, context: Context) {
  const where = `(This thread's branch is ${context.branch}; the repository's default branch is ${context.base}.)`;
  if (!file || file.kind === "missing") return `${defaultPrompt(context)}\n\n${where}`;
  if (file.kind === "binary") throw new ShipPromptError(`${SHIP_PROMPT_FILE} is not a text file`);
  const text = file.text.trim();
  if (file.truncated || text.length > MAX_SHIP_PROMPT_CHARS) {
    throw new ShipPromptError(
      `${SHIP_PROMPT_FILE} is longer than ${MAX_SHIP_PROMPT_CHARS.toLocaleString("en-US")} characters`,
    );
  }
  return `${text || defaultPrompt(context)}\n\n${where}`;
}
