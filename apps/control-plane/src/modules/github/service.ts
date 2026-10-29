import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@aven/db/client";
import { githubInstallations } from "@aven/db/schema/github-installations";
import { and, desc, eq } from "drizzle-orm";

import { NotFoundError, UnprocessableError } from "../../errors";
import { github as defaultClient, type GithubClient } from "./client";

export class InstallationNotAllowedError extends UnprocessableError {}
export class InstallationNotFoundError extends NotFoundError {
  constructor() {
    super("GitHub installation not found");
  }
}

const STATE_TTL_MS = 60 * 60_000;

// `state` ties the trip to GitHub and back to the organization and user who started it, so the
// callback cannot be used to attach an installation to someone else's organization.
function sign(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`github-install:${payload}`).digest("base64url");
}

export function createState(organizationId: string, userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify([organizationId, userId, now])).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function stateMatches(
  state: string,
  organizationId: string,
  userId: string,
  now = Date.now(),
) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const [org, user, issuedAt] = JSON.parse(Buffer.from(payload, "base64url").toString()) as [
      unknown,
      unknown,
      unknown,
    ];
    return (
      org === organizationId &&
      user === userId &&
      typeof issuedAt === "number" &&
      now - issuedAt >= 0 &&
      now - issuedAt < STATE_TTL_MS
    );
  } catch {
    return false;
  }
}

export function createGithubService(client: GithubClient = defaultClient) {
  const get = async (organizationId: string, id: string) => {
    const [row] = await db
      .select()
      .from(githubInstallations)
      .where(
        and(eq(githubInstallations.organizationId, organizationId), eq(githubInstallations.id, id)),
      );
    return row ?? null;
  };

  const require = async (organizationId: string, id: string) => {
    const installation = await get(organizationId, id);
    if (!installation) throw new InstallationNotFoundError();
    return installation;
  };

  return {
    get,

    status: () => ({ configured: client.configured }),

    list: (organizationId: string) =>
      db
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.organizationId, organizationId))
        .orderBy(desc(githubInstallations.createdAt)),

    // Where to send the browser to install the app on a GitHub account.
    installUrl(organizationId: string, userId: string) {
      const state = encodeURIComponent(createState(organizationId, userId));
      return `https://github.com/apps/${client.slug}/installations/new?state=${state}`;
    },

    // GitHub sent the browser back after an install. The installation is only attached when the
    // state is ours and GitHub confirms this user may use it.
    async connect(
      organizationId: string,
      userId: string,
      input: { installationId: number; state: string; code?: string },
    ) {
      if (!stateMatches(input.state, organizationId, userId)) {
        throw new InstallationNotAllowedError("The GitHub connection link is invalid or expired");
      }
      if (!input.code || !(await client.userCanUse(input.code, input.installationId))) {
        throw new InstallationNotAllowedError("GitHub did not confirm access to that installation");
      }
      const found = await client.installation(input.installationId);
      const [row] = await db
        .insert(githubInstallations)
        .values({
          organizationId,
          connectedBy: userId,
          installationId: found.installationId,
          accountLogin: found.accountLogin,
        })
        .onConflictDoUpdate({
          target: [githubInstallations.organizationId, githubInstallations.installationId],
          set: { accountLogin: found.accountLogin },
        })
        .returning();
      return row!;
    },

    async repos(organizationId: string, id: string) {
      const installation = await require(organizationId, id);
      return client.listRepos(installation.installationId);
    },

    async repo(organizationId: string, id: string, fullName: string) {
      const installation = await require(organizationId, id);
      return client.repo(installation.installationId, fullName);
    },

    // A read-only token for cloning a repository of the installation.
    async cloneToken(installationRowId: string) {
      const [row] = await db
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.id, installationRowId));
      if (!row) throw new InstallationNotFoundError();
      return (await client.installationToken(row.installationId)).token;
    },
  };
}

export const githubService = createGithubService();
