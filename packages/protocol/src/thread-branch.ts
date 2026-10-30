/** The branch a thread works on, so threads of one project do not share a branch name. */
export const threadBranch = (threadId: string) => `aven/${threadId.slice(0, 8)}`;
