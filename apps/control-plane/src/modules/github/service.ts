import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@aven/db/client";
import { githubInstallations } from "@aven/db/schema/github-installations";
import { and, desc, eq } from "drizzle-orm";

import { NotFoundError, UnprocessableError } from "../../errors";
import { GithubNoPushAccessError, GithubWriteNotGrantedError } from "./client";
import { githubClients, PLATFORM_APP } from "./clients";
import { isLocalPath } from "./schema";
import { githubUserTokenService } from "./user-tokens";
import type {
  GithubClients,
  GithubCommitFilters,
  GithubTrackedFilters,
  GithubTrackedKind,
  GithubTrackedState,
} from "./types";

export class InstallationNotAllowedError extends UnprocessableError {}
export class InstallationNotFoundError extends NotFoundError {
  constructor() {
    super("GitHub installation not found");
  }
}

const STATE_TTL_MS = 60 * 60_000;

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
  installationId?: number,
  appKey: string = PLATFORM_APP,
) {
  const claims: unknown[] = [organizationId, userId, now];
  const forApp = appKey !== PLATFORM_APP;

  if (next !== undefined || installationId !== undefined || forApp) claims.push(next ?? null);

  if (installationId !== undefined || forApp) claims.push(installationId ?? null);

  if (forApp) claims.push(appKey);

  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readState(
  state: string,
  organizationId: string,
  userId: string,
  now = Date.now(),
): { next: string | null; installationId: number | null; appKey: string } | null {
  const [payload, signature] = state.split(".");

  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);

  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const [org, user, issuedAt, next, installationId, appKey] = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as unknown[];
    const fresh =
      typeof issuedAt === "number" && now - issuedAt >= 0 && now - issuedAt < STATE_TTL_MS;

    if (org !== organizationId || user !== userId || !fresh) return null;

    return {
      next: typeof next === "string" && isLocalPath(next) ? next : null,
      installationId: typeof installationId === "number" ? installationId : null,
      appKey: typeof appKey === "string" ? appKey : PLATFORM_APP,
    };
  } catch {
    return null;
  }
}

export function createGithubService(
  clients: GithubClients = githubClients,
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

  const acting = async (installationRowId: string) => {
    const [row] = await db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.id, installationRowId));

    if (!row) throw new InstallationNotFoundError();

    const client = await clients.forKey(row.appId ?? PLATFORM_APP);
    return { client, installationId: row.installationId, accountLogin: row.accountLogin };
  };

  return {
    get,

    async status(organizationId: string) {
      const { key, client } = await clients.forOrganization(organizationId);
      return { configured: client.configured, appKey: key, own: key !== PLATFORM_APP };
    },

    async appKeyOf(installationRowId: string) {
      const [row] = await db
        .select({ appId: githubInstallations.appId })
        .from(githubInstallations)
        .where(eq(githubInstallations.id, installationRowId));

      if (!row) throw new InstallationNotFoundError();

      return row.appId ?? PLATFORM_APP;
    },

    list: (organizationId: string) =>
      db
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.organizationId, organizationId))
        .orderBy(desc(githubInstallations.createdAt)),

    async installUrl(organizationId: string, userId: string) {
      const { key, client } = await clients.forOrganization(organizationId);
      const state = encodeURIComponent(
        createState(organizationId, userId, Date.now(), undefined, undefined, key),
      );
      return `https://github.com/apps/${client.slug}/installations/new?state=${state}`;
    },

    async claimUrl(organizationId: string, userId: string, installationId: number) {
      const { key, client } = await clients.forOrganization(organizationId);
      return client.authorizeUrl(
        createState(organizationId, userId, Date.now(), undefined, installationId, key),
      );
    },

    async connectUrl(organizationId: string, userId: string, next?: string, appKey?: string) {
      const app = await clients.forOrganization(organizationId);
      const key = appKey ?? app.key;

      if (key !== app.key && key !== PLATFORM_APP) throw new InstallationNotFoundError();

      const client = key === app.key ? app.client : await clients.forKey(key);
      return client.authorizeUrl(
        createState(organizationId, userId, Date.now(), next, undefined, key),
      );
    },

    async connect(
      organizationId: string,
      userId: string,
      input: { installationId?: number; state: string; code?: string },
    ) {
      const state = readState(input.state, organizationId, userId);

      if (!state) {
        throw new InstallationNotAllowedError("The GitHub connection link is invalid or expired");
      }

      const app = await clients.forOrganization(organizationId);

      if (state.appKey !== PLATFORM_APP && state.appKey !== app.key) {
        throw new InstallationNotAllowedError("The GitHub connection link is invalid or expired");
      }

      const client = state.appKey === app.key ? app.client : await clients.forKey(state.appKey);
      const grant = input.code ? await client.exchangeCode(input.code) : null;

      if (!grant) throw new InstallationNotAllowedError("GitHub did not confirm your account");

      const installationId = input.installationId ?? state.installationId ?? undefined;

      if (installationId !== undefined) {
        if (!(await client.userCanUse(grant.accessToken, installationId))) {
          throw new InstallationNotAllowedError(
            "GitHub did not confirm access to that installation",
          );
        }

        const found = await client.installation(installationId);
        await db
          .insert(githubInstallations)
          .values({
            organizationId,
            connectedBy: userId,
            appId: state.appKey === PLATFORM_APP ? null : state.appKey,
            installationId: found.installationId,
            accountLogin: found.accountLogin,
          })
          .onConflictDoUpdate({
            target: [githubInstallations.organizationId, githubInstallations.installationId],
            set: { accountLogin: found.accountLogin },
          });
      }

      await userTokens.connect(userId, grant, state.appKey);
      return { next: state.next };
    },

    async cloneToken(installationRowId: string) {
      const { client, installationId } = await acting(installationRowId);
      return (await client.installationToken(installationId)).token;
    },

    async folder(installationRowId: string, fullName: string, path: string) {
      const { client, installationId } = await acting(installationRowId);
      return client.folder(installationId, fullName, path);
    },

    async readme(installationRowId: string, fullName: string) {
      const { client, installationId } = await acting(installationRowId);
      return client.readme(installationId, fullName);
    },

    async commits(
      installationRowId: string,
      fullName: string,
      page: number,
      defaultBranch: string,
      filters?: GithubCommitFilters,
    ) {
      const { client, installationId } = await acting(installationRowId);
      return client.commits(installationId, fullName, page, defaultBranch, filters);
    },

    async tracked(
      installationRowId: string,
      fullName: string,
      kind: GithubTrackedKind,
      state: GithubTrackedState,
      page: number,
      filters?: GithubTrackedFilters,
    ) {
      const { client, installationId } = await acting(installationRowId);
      return client.tracked(installationId, fullName, kind, state, page, filters);
    },

    async branches(installationRowId: string, fullName: string, defaultBranch: string) {
      const { client, installationId } = await acting(installationRowId);
      return client.branches(installationId, fullName, defaultBranch);
    },

    async pull(installationRowId: string, fullName: string, number: number) {
      const { client, installationId } = await acting(installationRowId);
      return client.pull(installationId, fullName, number);
    },

    async commit(installationRowId: string, fullName: string, sha: string) {
      const { client, installationId } = await acting(installationRowId);
      return client.commit(installationId, fullName, sha);
    },

    async findPullRequests(installationRowId: string, fullName: string, branchPrefix: string) {
      const { client, installationId } = await acting(installationRowId);
      return client.findPullRequests(installationId, fullName, branchPrefix);
    },

    async branchPullRequests(installationRowId: string, fullName: string, branch: string) {
      const { client, installationId } = await acting(installationRowId);
      return client.branchPullRequests(installationId, fullName, branch);
    },

    async requireWritable(installationRowId: string) {
      const { client, installationId, accountLogin } = await acting(installationRowId);

      if (!(await client.canWrite(installationId))) {
        throw new GithubWriteNotGrantedError(accountLogin);
      }
    },

    async requirePush(installationRowId: string, userToken: string, fullName: string) {
      const { client } = await acting(installationRowId);

      if (!(await client.canPush(userToken, fullName))) throw new GithubNoPushAccessError(fullName);
    },
  };
}

export const githubService = createGithubService();
