import { db } from "@aven/db/client";
import { githubUserTokens } from "@aven/db/schema/github-user-tokens";
import { eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "@aven/server-kit/crypto";
import { github, type GithubClient } from "@aven/github/client";
import type { GithubIdentity, GithubUserGrant, GithubUserToken } from "@aven/github/types";
import type { GithubUserTokenRow } from "@aven/db/schema/types";
import type { RunGithub } from "@aven/protocol/types";

const RUN_MIN_REMAINING_MS = 2 * 60 * 60_000;

const REFRESH_MARGIN_MS = 10 * 60_000;

const identityOf = (row: GithubUserTokenRow): GithubIdentity => ({
  id: row.githubUserId,
  login: row.login,
  name: row.name,
});

const ofPerson = (userId: string) => eq(githubUserTokens.userId, userId);

export function createGithubUserTokens(
  client: Pick<GithubClient, "refreshGrant" | "userProfile"> = github,
) {
  const renewing = new Map<string, Promise<GithubUserToken | null>>();

  const remove = async (userId: string) => {
    await db.delete(githubUserTokens).where(ofPerson(userId));
  };

  const store = async (userId: string, grant: GithubUserGrant, identity: GithubIdentity) => {
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
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: githubUserTokens.userId,
        set: values,
      });
  };

  const drop = async (userId: string, reason: unknown) => {
    console.warn(`The GitHub connection of user ${userId} was dropped:`, reason);
    await remove(userId);
    return null;
  };

  async function renew(row: GithubUserTokenRow) {
    const { userId } = row;
    const expired = row.refreshExpiresAt !== null && row.refreshExpiresAt.getTime() <= Date.now();

    if (!row.refreshTokenEncrypted || expired) return drop(userId, "no usable refresh token");

    let refreshToken: string;
    try {
      refreshToken = decryptSecret(row.refreshTokenEncrypted);
    } catch (error) {
      return drop(userId, error);
    }
    const grant = await client.refreshGrant(refreshToken);

    if (!grant) return drop(userId, "GitHub refused the refresh token");

    await store(userId, grant, identityOf(row));
    return { token: grant.accessToken, identity: identityOf(row) };
  }

  async function use(
    userId: string,
    minRemainingMs = REFRESH_MARGIN_MS,
  ): Promise<GithubUserToken | null> {
    const [row] = await db.select().from(githubUserTokens).where(ofPerson(userId));

    if (!row) return null;

    const fresh =
      row.accessExpiresAt === null || row.accessExpiresAt.getTime() - Date.now() > minRemainingMs;

    if (fresh) {
      try {
        return {
          token: decryptSecret(row.accessTokenEncrypted),
          identity: identityOf(row),
        };
      } catch (error) {
        return drop(userId, error);
      }
    }

    const running = renewing.get(userId) ?? renew(row).finally(() => renewing.delete(userId));
    renewing.set(userId, running);
    return running;
  }

  return {
    async connect(userId: string, grant: GithubUserGrant) {
      const profile = await client.userProfile(grant.accessToken);
      await store(userId, grant, profile);
      return profile;
    },

    async status(userId: string): Promise<{ login: string } | null> {
      const [row] = await db
        .select({ login: githubUserTokens.login })
        .from(githubUserTokens)
        .where(ofPerson(userId));
      return row ?? null;
    },

    use,

    async forRun(userId: string): Promise<RunGithub | undefined> {
      try {
        const connection = await use(userId, RUN_MIN_REMAINING_MS);

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
