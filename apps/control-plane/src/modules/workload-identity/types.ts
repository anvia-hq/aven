import type { SUBJECT_SCOPES } from "./schema";

export type RunIdentity = {
  organizationId: string;
  projectId: string;
  threadId: string;
  userId: string;
  email: string;
};

export type SubjectScope = (typeof SUBJECT_SCOPES)[number];
