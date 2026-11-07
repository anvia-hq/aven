export const FORKS_PER_THREAD = 3;

export const FORK_TEXT_MAX = 20_000;

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
