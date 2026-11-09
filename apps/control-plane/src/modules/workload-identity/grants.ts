import { randomBytes } from "node:crypto";

import { issuer as defaultIssuer, type Issuer } from "./issuer";
import type { MintTokenBody } from "./schema";
import type { RunIdentity, SubjectScope } from "./types";

const TOKEN_PREFIX = "avid_";

const SUBJECTS: Record<SubjectScope, (identity: RunIdentity) => string> = {
  thread: (identity) => `thread:${identity.threadId}`,
  project: (identity) => `project:${identity.projectId}`,
  organization: (identity) => `organization:${identity.organizationId}`,
};

export class RunIdentities {
  #grants = new Map<string, RunIdentity>();
  #credentials = new Map<string, string>();

  constructor(private issuer: Pick<Issuer, "sign"> = defaultIssuer) {}

  issue(runId: string, identity: RunIdentity) {
    this.revoke(runId);
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

  async mint(credential: string, { audience, subjectScope, lifetime }: MintTokenBody) {
    const identity = this.#grants.get(credential);
    if (!identity) return null;
    const issuedAt = Math.floor(Date.now() / 1000);
    const driver: Record<string, string> = {};
    if (identity.driverId !== undefined) driver.driver_id = identity.driverId;
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
      ...driver,
    });
  }
}

export const runIdentities = new RunIdentities();
