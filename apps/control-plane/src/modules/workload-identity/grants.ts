import { randomBytes } from "node:crypto";

import { issuer as defaultIssuer, type Issuer } from "./issuer";
import type { MintTokenBody, SubjectScope } from "./schema";

const TOKEN_PREFIX = "avid_";

/** Who a run is, for the tokens it mints: kept here, never sent to the runner (decision 0049). */
export type RunIdentity = {
  organizationId: string;
  projectId: string;
  threadId: string;
  userId: string;
  email: string;
};

const SUBJECTS: Record<SubjectScope, (identity: RunIdentity) => string> = {
  thread: (identity) => `thread:${identity.threadId}`,
  project: (identity) => `project:${identity.projectId}`,
  organization: (identity) => `organization:${identity.organizationId}`,
};

// What lets a run mint identity tokens, as the gateway's grants let it call a model (decision 0008):
// each run gets a random credential for who it is, and it ends with the run. The sandbox holds the
// credential, not the identity, so the agent cannot claim another thread's or person's.
export class RunIdentities {
  #grants = new Map<string, RunIdentity>();
  #credentials = new Map<string, string>();

  constructor(private issuer: Pick<Issuer, "sign"> = defaultIssuer) {}

  issue(runId: string, identity: RunIdentity) {
    const credential = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
    this.#grants.set(credential, identity);
    this.#credentials.set(runId, credential);
    return credential;
  }

  revoke(runId: string) {
    const credential = this.#credentials.get(runId);
    if (!credential) return;
    this.#credentials.delete(runId);
    this.#grants.delete(credential);
  }

  /** A signed token for the run the credential belongs to, or null when there is none (an ended run's). */
  async mint(credential: string, { audience, subjectScope, lifetime }: MintTokenBody) {
    const identity = this.#grants.get(credential);
    if (!identity) return null;
    const issuedAt = Math.floor(Date.now() / 1000);
    return this.issuer.sign({
      aud: audience,
      sub: SUBJECTS[subjectScope](identity),
      iat: issuedAt,
      nbf: issuedAt,
      exp: issuedAt + lifetime,
      jti: crypto.randomUUID(),
      organization_id: identity.organizationId,
      project_id: identity.projectId,
      thread_id: identity.threadId,
      user_id: identity.userId,
      email: identity.email,
    });
  }
}

export const runIdentities = new RunIdentities();
