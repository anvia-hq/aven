const THREAD_BRANCH = /^(aven\/[0-9a-f]{8})(?:-|$)/;

export const threadBranchFamily = (branch: string) => THREAD_BRANCH.exec(branch)?.[1] ?? null;
