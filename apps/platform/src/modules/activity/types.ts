export type ActivityKind = "thread" | "commit" | "team";

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  at: string;
  threadId?: string;
};
