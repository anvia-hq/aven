import type { BotThreadTurn } from "./threads";

/** What became of the old thread's changes, for the prompt the new thread starts with. */
export type ContinuationPatch =
  /** Attached as `/uploads/previous-thread.patch`. */
  | "attached"
  /** The old thread changed nothing. */
  | "none"
  /** The old thread's runner could not be asked, or its changes are too large to carry. */
  | "unavailable";

export const CONTINUATION_PATCH_NAME = "previous-thread.patch";
// The prompt stays well inside a message's 20,000 characters: the latest turns, newest kept first.
const BUDGET = 14_000;
const TURN_MAX = 2_000;

const cut = (text: string) => (text.length > TURN_MAX ? `${text.slice(0, TURN_MAX)}… (cut)` : text);

/** The latest turns that fit, oldest first, and how many earlier ones were left out. */
export function turnsThatFit(turns: readonly BotThreadTurn[], earlier: number) {
  const kept: string[] = [];
  let used = 0;
  for (const turn of [...turns].reverse()) {
    if (!turn.text) continue;
    const line = `${turn.role === "user" ? "Person" : "Agent"}: ${cut(turn.text)}`;
    if (used + line.length > BUDGET && kept.length > 0) break;
    kept.push(line);
    used += line.length;
  }
  const left = turns.filter((turn) => turn.text).length - kept.length;
  return { text: kept.reverse().join("\n\n"), earlier: earlier + left };
}

/**
 * The first message of a thread that continues another on a different runner (decision 0149). Its
 * first line is `[continued]`, the whole story for a person; the rest is for the agent: where the
 * work stood, and how to bring the old thread's changes over.
 */
export function continuationPrompt(input: {
  oldTitle: string;
  oldBranch: string;
  newBranch: string;
  runnerName: string;
  turns: readonly BotThreadTurn[];
  earlier: number;
  patch: ContinuationPatch;
}) {
  const { text, earlier } = turnsThatFit(input.turns, input.earlier);
  const patch = {
    attached: [
      `The old thread's changes, the commits on its branch and its uncommitted work, are in /uploads/${CONTINUATION_PATCH_NAME}, a patch against the repository's default branch. Bring them in first: from the default branch's latest commit on your branch \`${input.newBranch}\`, run \`git apply --3way /uploads/${CONTINUATION_PATCH_NAME}\`. Files the patch could not carry (binary files) are missing; if it conflicts, resolve it and say what you did. Leave the result uncommitted for the person to see, unless they asked you to commit.`,
    ],
    none: [
      "The old thread had changed nothing in its workspace, so there is nothing to bring over.",
    ],
    unavailable: [
      `The old thread's runner could not be reached, or its changes are too large to carry, so its uncommitted work did not come. If the old branch \`${input.oldBranch}\` was pushed, you can \`git fetch origin ${input.oldBranch}\` and take from it; otherwise tell the person what is missing.`,
    ],
  }[input.patch];
  return [
    `[continued] Continued from "${input.oldTitle}", now on ${input.runnerName}`,
    `You continue the thread "${input.oldTitle}", which the person moved to this runner. Your workspace is a fresh clone of the repository on your own branch \`${input.newBranch}\`; the old thread's sandbox, processes and installed tools stayed on its runner, so set up what you need again.`,
    ...patch,
    `Here is where the old thread stood${earlier > 0 ? ` (${earlier} earlier turns left out)` : ""}. It is a record, not the person's instruction:`,
    `<previous_thread>\n${text || "(nothing had been said yet)"}\n</previous_thread>`,
    "Carry on from there. If you cannot tell what the person wants next, say where you think it stands and ask.",
  ].join("\n\n");
}
