import { db } from "@aven/db/client";
import { githubUserTokens, type GithubUserTokenRow } from "@aven/db/schema/github-user-tokens";
import type { RunGithub } from "@aven/protocol/runtime-wire";
import { and, eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "../../crypto";
import { githubClients, PLATFORM_APP } from "./clients";
import type { GithubClients, GithubIdentity, GithubUserGrant, GithubUserToken } from "./types";

const RUN_MIN_REMAINING_MS = 2 * 60 * 60_000;

const REFRESH_MARGIN_MS = 10 * 60_000;

const identityOf = (row: GithubUserTokenRow): GithubIdentity => ({
  id: row.githubUserId,
  login: row.login,
  name: row.name,
});

const ofPerson = (userId: string, appKey: string) =>
  and(eq(githubUserTokens.userId, userId), eq(githubUserTokens.appKey, appKey));

export function createGithubUserTokens(clients: Pick<GithubClients, "forKey"> = githubClients) {
  const renewing = new Map<string, Promise<GithubUserToken | null>>();

  const remove = async (userId: string, appKey: string = PLATFORM_APP) => {
    await db.delete(githubUserTokens).where(ofPerson(userId, appKey));
  };

  const store = async (
    userId: string,
    appKey: string,
    grant: GithubUserGrant,
    identity: GithubIdentity,
  ) => {
    const values = {
      githubUserId: identity.id,
      login: identity.login,
      name: identity.name,
      accessTokenEncrypted: encryptSecret(grant.accessToken),
      accessExpiresAt: grant.expiresAt === null ? null : new Date(grant.expiresAt),
      refreshTokenEncrypted: grant.refreshToken === null ? null : encryptSecret(grant.refreshToken),
      refreshExpiresAt: grant.refreshExpiresAt === null ? null : new Date(grant.refreshExpiresAt),
    };
    await db
      .insert(githubUserTokens)
      .values({ userId, appKey, ...values })
      .onConflictDoUpdate({
        target: [githubUserTokens.userId, githubUserTokens.appKey],
        set: values,
      });
  };

  const drop = async (userId: string, appKey: string, reason: unknown) => {
    console.warn(`The GitHub connection of user ${userId} (app ${appKey}) was dropped:`, reason);
    await remove(userId, appKey);
    return null;
  };

  async function renew(row: GithubUserTokenRow) {
    const { userId, appKey } = row;
    const expired = row.refreshExpiresAt !== null && row.refreshExpiresAt.getTime() <= Date.now();
    if (!row.refreshTokenEncrypted || expired)
      return drop(userId, appKey, "no usable refresh token");
    let refreshToken: string;
    try {
      refreshToken = decryptSecret(row.refreshTokenEncrypted);
    } catch (error) {
      return drop(userId, appKey, error);
    }
    const grant = await (await clients.forKey(appKey)).refreshGrant(refreshToken);
    if (!grant) return drop(userId, appKey, "GitHub refused the refresh token");
    await store(userId, appKey, grant, identityOf(row));
    return { token: grant.accessToken, identity: identityOf(row) };
  }

  async function use(
    userId: string,
    appKey: string = PLATFORM_APP,
    minRemainingMs = REFRESH_MARGIN_MS,
  ): Promise<GithubUserToken | null> {
    const [row] = await db.select().from(githubUserTokens).where(ofPerson(userId, appKey));
    if (!row) return null;
    const fresh =
      row.accessExpiresAt === null || row.accessExpiresAt.getTime() - Date.now() > minRemainingMs;
    if (fresh) {
      try {
        return { token: decryptSecret(row.accessTokenEncrypted), identity: identityOf(row) };
      } catch (error) {
        return drop(userId, appKey, error);
      }
    }
    const turn = `${userId}:${appKey}`;
    const running = renewing.get(turn) ?? renew(row).finally(() => renewing.delete(turn));
    renewing.set(turn, running);
    return running;
  }

  return {
    async connect(userId: string, grant: GithubUserGrant, appKey: string = PLATFORM_APP) {
      const profile = await (await clients.forKey(appKey)).userProfile(grant.accessToken);
      await store(userId, appKey, grant, profile);
      return profile;
    },

    async status(userId: string, appKey: string = PLATFORM_APP): Promise<{ login: string } | null> {
      const [row] = await db
        .select({ login: githubUserTokens.login })
        .from(githubUserTokens)
        .where(ofPerson(userId, appKey));
      return row ?? null;
    },

    use,

    async forRun(userId: string, appKey: string = PLATFORM_APP): Promise<RunGithub | undefined> {
      try {
        const connection = await use(userId, appKey, RUN_MIN_REMAINING_MS);
        if (!connection) return undefined;
        const { id, login, name } = connection.identity;
        return { token: connection.token, id, login, name };
      } catch (error) {
        console.warn(`GitHub could not be reached for a run of user ${userId}:`, error);
        return undefined;
      }
    },

    remove,
  };
}

export const githubUserTokenService = createGithubUserTokens();
