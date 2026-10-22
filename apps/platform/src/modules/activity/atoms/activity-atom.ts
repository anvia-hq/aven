import { atom } from "jotai";

import type { ActivityEvent } from "../types";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const activityAtom = atom<ActivityEvent[]>([
  {
    id: "a1",
    kind: "thread",
    title: "Agent finished a thread",
    detail: "Add rate limiting to the API",
    at: minutesAgo(12),
    threadId: "t-rate-limit",
  },
  {
    id: "a2",
    kind: "commit",
    title: "Commit pushed to main",
    detail: "fix(auth): reject expired sessions · 3f9a1c2",
    at: minutesAgo(48),
  },
  {
    id: "a3",
    kind: "thread",
    title: "Agent finished a thread",
    detail: "Fix flaky sign-out e2e test",
    at: minutesAgo(95),
    threadId: "t-flaky-e2e",
  },
  {
    id: "a4",
    kind: "team",
    title: "Sari Wulandari joined the workspace",
    detail: "Role: Admin",
    at: minutesAgo(60 * 5),
  },
  {
    id: "a5",
    kind: "commit",
    title: "Commit pushed to feat/search",
    detail: "feat(docs): add MiniSearch index · 81bd0e7",
    at: minutesAgo(60 * 20),
  },
  {
    id: "a6",
    kind: "thread",
    title: "Thread archived",
    detail: "Set up GitHub Actions for typecheck",
    at: minutesAgo(60 * 24 * 2),
    threadId: "t-old-ci",
  },
  { id: "a7", kind: "team", title: "API key created", detail: "CI", at: minutesAgo(60 * 24 * 3) },
  {
    id: "a8",
    kind: "commit",
    title: "Commit pushed to main",
    detail: "chore(deps): update dependencies · c07e5aa",
    at: minutesAgo(60 * 24 * 4),
  },
]);
