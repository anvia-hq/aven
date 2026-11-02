import type { FileContent } from "@aven/protocol/runtime-wire";

import { UnprocessableError } from "../../errors";

/** Where a repository keeps its own way of shipping (decision 0044). */
export const SHIP_PROMPT_FILE = ".aven/ship.md";

/** Where `/setup-env` writes the repository's environment script (decision 0043). */
export const SETUP_FILE = ".aven/setup";

/** A custom prompt may be this long, as in Amp. */
export const MAX_SHIP_PROMPT_CHARS = 10_000;

export class ShipPromptError extends UnprocessableError {}

/** What a Ship does with the thread's pull requests (decision 0069). */
export type ShipMode =
  /** The thread has no pull request yet: ship its own branch. */
  | "first"
  /** Push the checked-out branch, which updates its open pull request. */
  | "update"
  /** Open a separate pull request, on a new branch, for work an earlier one does not hold. */
  | "new";

type PullRequest = { number: number; state: string; branch: string; title: string };

type Context = {
  branch: string;
  base: string;
  mode: ShipMode;
  /** The thread's pull requests, newest first. */
  pullRequests: PullRequest[];
};

// A title is written by whoever opened the pull request and reaches the prompt: one line, cut short.
const quote = (title: string) => JSON.stringify(title.replace(/\s+/g, " ").trim().slice(0, 80));

// How new work gets its own branch, for a prompt of Aven's and for a repository's own.
const startBranch = ({ branch, base }: Context) =>
  `Start a new branch from the default branch (git fetch origin ${base}, then git switch -c ${branch}-<short-slug> origin/${base}) and bring over only the new work (git cherry-pick its commits, or git checkout <old-branch> -- <paths>). Leave the earlier branches and their pull requests alone.`;

// What the agent is asked to do with the branch and the pull request, by mode.
function modeNote(context: Context) {
  const { base, mode, pullRequests } = context;
  const [latest] = pullRequests;
  if (mode === "update" && latest) {
    return `This ship updates the open pull request #${latest.number}: push the branch that is checked out (git branch --show-current; it should be ${latest.branch}), which updates it, and do not open another pull request. If gh shows #${latest.number} is no longer open, stop and tell me.`;
  }
  if (mode === "new") {
    return `This ship is for a new, separate pull request. Work out which of the changes here (uncommitted, or committed and not yet in ${base}) are new work and which the pull requests above already hold; if you cannot tell, ask me. ${startBranch(context)} Then ship that branch as described, and open a pull request for it.`;
  }
  return "";
}

// What Ship asks the agent to do when the repository has no `.aven/ship.md`.
function defaultPrompt(context: Context) {
  const { base, mode } = context;
  const steps =
    mode === "new"
      ? [
          `Look at git status, git diff and git log origin/${base}..HEAD, and work out which changes are new work and which the pull requests listed below already hold. Ask me if you cannot tell.`,
          startBranch(context),
          "Commit it with clear imperative commit messages. Do not commit secrets, .env files or build output.",
        ]
      : [
          "Look at git status and git diff. Commit everything that belongs to the work, with clear imperative commit messages. Do not commit secrets, .env files or build output.",
          `Bring the branch up to date: git fetch origin ${base}, then rebase onto origin/${base}. Resolve conflicts if you can; if one needs a decision, ask me.`,
        ];
  steps.push(
    "Run the project's checks (tests, lint, typecheck) the way its README, AGENTS.md or CI does, and fix what you broke. If something fails that you cannot fix, stop and tell me.",
    `Push the branch with git push -u origin HEAD. Never force-push to ${base}.`,
    mode === "update"
      ? "Its pull request is updated by the push: do not open another. Tell me its URL."
      : `Open a draft pull request into ${base} with gh pr create --draft, with a title and description that say what changed and why. If one is already open for this branch, the push updates it: do not open another. Tell me the pull request's URL.`,
  );
  const numbered = steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  return `${mode === "new" ? "Ship the new work in this thread as its own pull request." : "Ship this thread's work as a pull request."}\n\n${numbered}`;
}

// Where the thread is: its branch, the default branch, its pull requests and how its branches are named.
function whereNote(context: Context) {
  const { branch, base, pullRequests } = context;
  const lines = [
    `(This thread's branch is ${branch}; the repository's default branch is ${base}.)`,
    `A branch of this thread is named ${branch} or starts with ${branch}-, so that Aven finds its pull request.`,
  ];
  if (pullRequests.length > 0) {
    lines.push(
      "This thread's pull requests, newest first, as Aven last saw them (check with gh before relying on a state):",
      ...pullRequests.map(
        (pull) => `- #${pull.number} ${pull.state}, branch ${pull.branch}, ${quote(pull.title)}`,
      ),
    );
  }
  return lines.join("\n");
}

/**
 * The prompt a Ship sends the agent: the repository's own `.aven/ship.md` when it has one, else
 * Aven's default. A custom prompt is sent as it is, followed by where the thread is and, when it
 * has pull requests, what this ship does with them, so the agent need not look it up. `file` is
 * what the runner answered for `.aven/ship.md`.
 */
export function shipPrompt(file: FileContent | null, context: Context) {
  const where = whereNote(context);
  if (!file || file.kind === "missing") return `${defaultPrompt(context)}\n\n${where}`;
  if (file.kind === "binary") throw new ShipPromptError(`${SHIP_PROMPT_FILE} is not a text file`);
  const text = file.text.trim();
  if (file.truncated || text.length > MAX_SHIP_PROMPT_CHARS) {
    throw new ShipPromptError(
      `${SHIP_PROMPT_FILE} is longer than ${MAX_SHIP_PROMPT_CHARS.toLocaleString("en-US")} characters`,
    );
  }
  // A custom prompt does not know about the mode, so it is told after where the thread is.
  if (!text) return `${defaultPrompt(context)}\n\n${where}`;
  const note = modeNote(context);
  return `${text}\n\n${where}${note ? `\n\n${note}` : ""}`;
}
