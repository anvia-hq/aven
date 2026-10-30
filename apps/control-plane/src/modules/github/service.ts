import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@aven/db/client";
import { githubInstallations } from "@aven/db/schema/github-installations";
import { and, desc, eq } from "drizzle-orm";

import { NotFoundError, UnprocessableError } from "../../errors";
import {
  github as defaultClient,
  GithubNoPushAccessError,
  GithubWriteNotGrantedError,
  type GithubClient,
} from "./client";
import { isLocalPath } from "./schema";
import { githubUserTokenService } from "./user-tokens";

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

export function createState(
  organizationId: string,
  userId: string,
  now = Date.now(),
  next?: string,
) {
  const claims: unknown[] = [organizationId, userId, now];
  if (next !== undefined) claims.push(next);
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** What a `state` of ours carries when it was made for this organization and user, still fresh: where to go back to. Null otherwise. */
export function readState(
  state: string,
  organizationId: string,
  userId: string,
  now = Date.now(),
): { next: string | null } | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [org, user, issuedAt, next] = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as unknown[];
    const fresh =
      typeof issuedAt === "number" && now - issuedAt >= 0 && now - issuedAt < STATE_TTL_MS;
    if (org !== organizationId || user !== userId || !fresh) return null;
    return { next: typeof next === "string" && isLocalPath(next) ? next : null };
  } catch {
    return null;
  }
}

export function createGithubService(
  client: GithubClient = defaultClient,
  userTokens: Pick<typeof githubUserTokenService, "connect"> = githubUserTokenService,
) {
  const get = async (organizationId: string, id: string) => {
    const [row] = await db
      .select()
      .from(githubInstallations)
      .where(
        and(eq(githubInstallations.organizationId, organizationId), eq(githubInstallations.id, id)),
      );
    return row ?? null;
  };

  // GitHub's own id of the installation a row stands for.
  const githubInstallationId = async (installationRowId: string) => {
    const [row] = await db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.id, installationRowId));
    if (!row) throw new InstallationNotFoundError();
    return row.installationId;
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

    // Where to send the browser so the person lets the app act as their GitHub account, and then
    // back to `next` (decision 0041).
    connectUrl(organizationId: string, userId: string, next?: string) {
      return client.authorizeUrl(createState(organizationId, userId, Date.now(), next));
    },

    // GitHub sent the browser back with the person's authorization, after an install
    // (`installationId`) or after they connected their account. The installation is only attached
    // when the state is ours and GitHub confirms this user may use it; the person's token is kept
    // either way. Returns where to send the browser next, if the state said.
    async connect(
      organizationId: string,
      userId: string,
      input: { installationId?: number; state: string; code?: string },
    ) {
      const state = readState(input.state, organizationId, userId);
      if (!state) {
        throw new InstallationNotAllowedError("The GitHub connection link is invalid or expired");
      }
      const grant = input.code ? await client.exchangeCode(input.code) : null;
      if (!grant) throw new InstallationNotAllowedError("GitHub did not confirm your account");
      if (input.installationId !== undefined) {
        if (!(await client.userCanUse(grant.accessToken, input.installationId))) {
          throw new InstallationNotAllowedError(
            "GitHub did not confirm access to that installation",
          );
        }
        const found = await client.installation(input.installationId);
        await db
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
          });
      }
      await userTokens.connect(userId, grant);
      return { next: state.next };
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
      return (await client.installationToken(await githubInstallationId(installationRowId))).token;
    },

    // Ships need the app approved to write for the installation's account (decision 0041).
    async requireWritable(installationRowId: string) {
      const [row] = await db
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.id, installationRowId));
      if (!row) throw new InstallationNotFoundError();
      if (!(await client.canWrite(row.installationId))) {
        throw new GithubWriteNotGrantedError(row.accountLogin);
      }
    },

    // ...and the person to be allowed to push to the repository themselves.
    async requirePush(userToken: string, fullName: string) {
      if (!(await client.canPush(userToken, fullName))) throw new GithubNoPushAccessError(fullName);
    },

    // The open pull request for a branch, opened first when there is none, as the person.
    openPullRequest(userToken: string, input: Parameters<GithubClient["openPullRequest"]>[1]) {
      return client.openPullRequest(userToken, input);
    },
  };
}

export const githubService = createGithubService();
