export type SnapshotState = {
  state: "idle" | "running";
  startedAt?: string;
  savedAt?: string;
  error?: string;
};
