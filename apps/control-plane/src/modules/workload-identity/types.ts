import type { SUBJECT_SCOPES } from "./schema";

export type RunIdentity = {
  organizationId: string;
  projectId: string;
  threadId: string;
  userId: string;
  email: string;
  driverId?: string;
};

export type SubjectScope = (typeof SUBJECT_SCOPES)[number];

export type IssuerKeyStore = {
  load(): Promise<string | null>;
  save(pem: string): Promise<string>;
};

export type IssuerOptions = {
  privateKey?: string;
  store?: IssuerKeyStore;
};
