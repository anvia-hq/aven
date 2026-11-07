/** How many forks of one thread may be going at once: each is a container and a copy of the workspace (decision 0135). */
export const FORKS_PER_THREAD = 3;

/** The longest task or summary a thread's agent gives a fork. */
export const FORK_TEXT_MAX = 20_000;

/** What the agent that forked a thread sees of one of its forks. */
export type ForkView = {
  id: string;
  title: string;
  /** Its agent is working now. */
  running: boolean;
  /** It was archived: its sandbox is freed, its workspace kept. */
  archived: boolean;
  /** Why its latest run failed, when it did. */
  error: string | null;
  /** What its agent last said, which is its report when it is done; empty before it says anything. */
  lastMessage: string;
};

/** The prompt a fork starts with: what it is to do, and what its parent knows (decision 0135). */
export function forkPrompt(
  { task, context }: { task: string; context: string },
  { branch, parentTitle }: { branch: string; parentTitle: string },
) {
  return [
    `You are a fork of the thread "${parentTitle}". Its agent handed you one task to do apart from it.`,
    `Your workspace is a copy of the parent thread's, with its uncommitted changes, on your own branch \`${branch}\`. If the parent's workspace could not be copied you have a fresh clone instead: say so in your report.`,
    `Work only on the task. Do not push or open a pull request unless the task says to: the parent takes your changes from your workspace. When you are done, say what you changed and what you found.`,
    `<task>\n${task}\n</task>`,
    `<what_the_parent_knows>\n${context}\n</what_the_parent_knows>`,
  ].join("\n\n");
}
