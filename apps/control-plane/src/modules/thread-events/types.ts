import type { GithubPullDetail } from "@aven/github/types";

export type ThreadEvent =
  | { kind: "merged"; thread: EventThread; pull: EventPull }
  | { kind: "ci_failing"; thread: EventThread; pull: EventPull; failing: string[] }
  | { kind: "waiting"; thread: EventThread; run: number | null; question: string | undefined };

export type EventThread = { id: string; title: string; repository: string };

export type EventPull = { number: number; url: string; title: string };

export type OfferResult = "sent" | "duplicate" | "limited" | "failed";

export type WatchedPull = {
  threadId: string;
  userId: string;
  threadTitle: string;
  repository: string;
  installationId: string;
  number: number;
  url: string;
  branch: string;
  title: string;
};

export type PullWatchSource = {
  openPulls(limit: number): Promise<WatchedPull[]>;
  inspect(pull: WatchedPull): Promise<GithubPullDetail | null>;
  saveEnded(pull: WatchedPull, state: "merged" | "closed"): Promise<void>;
};
