import { describe, expect, test } from "bun:test";

import { RunIdentities } from "./grants";
import { Issuer } from "./issuer";
import { mintTokenBody } from "./schema";
import type { RunIdentity } from "./types";

const identity: RunIdentity = {
  organizationId: "org-1",
  projectId: "project-1",
  threadId: "thread-1",
  userId: "user-1",
  email: "person@example.com",
};
const request = (overrides: object = {}) =>
  mintTokenBody.parse({ audience: "https://svc", ...overrides });
const payload = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());

async function setup() {
  const issuer = await Issuer.create("https://aven.example/api/workload-identity");
  const identities = new RunIdentities(issuer);
  return { identities, credential: identities.issue("run-1", identity) };
}

describe("RunIdentities", () => {
  test("mints a token carrying the run's identity, by default for the thread, for ten minutes", async () => {
    const { identities, credential } = await setup();

    const claims = payload((await identities.mint(credential, request()))!);

    expect(claims).toMatchObject({
      iss: "https://aven.example/api/workload-identity",
      aud: "https://svc",
      sub: "thread:thread-1",
      organization_id: "org-1",
      project_id: "project-1",
      thread_id: "thread-1",
      user_id: "user-1",
      email: "person@example.com",
    });
    expect(claims.exp - claims.iat).toBe(600);
    expect(claims.nbf).toBe(claims.iat);
  });

  test("the subject follows the scope, and the claims stay", async () => {
    const { identities, credential } = await setup();

    const project = payload(
      (await identities.mint(credential, request({ subjectScope: "project" })))!,
    );
    const organization = payload(
      (await identities.mint(credential, request({ subjectScope: "organization" })))!,
    );

    expect(project.sub).toBe("project:project-1");
    expect(organization.sub).toBe("organization:org-1");
    expect(organization.thread_id).toBe("thread-1");
  });

  test("each token has its own id and the lifetime asked for", async () => {
    const { identities, credential } = await setup();

    const a = payload((await identities.mint(credential, request({ lifetime: 60 })))!);
    const b = payload((await identities.mint(credential, request({ lifetime: 3600 })))!);

    expect(a.jti).not.toBe(b.jti);
    expect(a.exp - a.iat).toBe(60);
    expect(b.exp - b.iat).toBe(3600);
  });

  test("mints nothing for an unknown credential or after the run ends", async () => {
    const { identities, credential } = await setup();

    expect(await identities.mint("avid_nope", request())).toBeNull();
    identities.revoke("run-1");
    expect(await identities.mint(credential, request())).toBeNull();
  });

  test("revoking one run leaves another's credential working", async () => {
    const { identities, credential } = await setup();
    const other = identities.issue("run-2", { ...identity, threadId: "thread-2" });

    identities.revoke("run-1");

    expect(await identities.mint(credential, request())).toBeNull();
    expect(payload((await identities.mint(other, request()))!).thread_id).toBe("thread-2");
  });
});

describe("mintTokenBody", () => {
  test("refuses a lifetime outside a minute to an hour, and an unknown scope", () => {
    expect(mintTokenBody.safeParse({ audience: "a", lifetime: 59 }).success).toBe(false);
    expect(mintTokenBody.safeParse({ audience: "a", lifetime: 3601 }).success).toBe(false);
    expect(mintTokenBody.safeParse({ audience: "a", subjectScope: "user" }).success).toBe(false);
    expect(mintTokenBody.safeParse({ audience: "" }).success).toBe(false);
  });
});
