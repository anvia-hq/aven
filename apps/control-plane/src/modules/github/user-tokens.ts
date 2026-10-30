import { db } from "@aven/db/client";
import { githubUserTokens, type GithubUserTokenRow } from "@aven/db/schema/github-user-tokens";
import { eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "../providers/crypto";
import { github as defaultClient, type GithubClient, type GithubUserGrant } from "./client";

/** Who a connected GitHub account is: the commit identity of what the person ships (decision 0041). */
export type GithubIdentity = { id: number; login: string; name: string | null };

/** A person's usable GitHub token, and whose it is. */
export type GithubUserToken = { token: string; identity: GithubIdentity };

// A token is renewed when it has less than this left, so one never expires in flight.
const REFRESH_MARGIN_MS = 60_000;

const identityOf = (row: GithubUserTokenRow): GithubIdentity => ({
  id: row.githubUserId,
  login: row.login,
  name: row.name,
});

// The GitHub accounts people have connected (decision 0041). A user token lasts eight hours; it is
// renewed when it is used. A refresh token works once, so one renewal runs at a time per person.
export function createGithubUserTokens(
  client: Pick<GithubClient, "refreshGrant" | "userProfile"> = defaultClient,
) {
  const renewing = new Map<string, Promise<GithubUserToken | null>>();

  const remove = async (userId: string) => {
    await db.delete(githubUserTokens).where(eq(githubUserTokens.userId, userId));
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
      .onConflictDoUpdate({ target: githubUserTokens.userId, set: values });
  };

  // Gets a new token with the stored refresh token. One GitHub refuses, or one that cannot be
  // read, leaves the person not connected.
  async function renew(row: GithubUserTokenRow) {
    const { userId } = row;
    try {
      const expired = row.refreshExpiresAt !== null && row.refreshExpiresAt.getTime() <= Date.now();
      if (!row.refreshTokenEncrypted || expired) throw new Error("no usable refresh token");
      const grant = await client.refreshGrant(decryptSecret(row.refreshTokenEncrypted));
      if (!grant) throw new Error("GitHub refused the refresh token");
      await store(userId, grant, identityOf(row));
      return { token: grant.accessToken, identity: identityOf(row) };
    } catch (error) {
      console.warn(`The GitHub connection of user ${userId} was dropped:`, error);
      await remove(userId);
      return null;
    }
  }

  return {
    // Connects the account a grant belongs to, or reconnects it.
    async connect(userId: string, grant: GithubUserGrant) {
      const profile = await client.userProfile(grant.accessToken);
      await store(userId, grant, profile);
      return profile;
    },

    /** The connected account's login, or null when the person has not connected one. */
    async status(userId: string): Promise<{ login: string } | null> {
      const [row] = await db
        .select({ login: githubUserTokens.login })
        .from(githubUserTokens)
        .where(eq(githubUserTokens.userId, userId));
      return row ?? null;
    },

    // A token to act as the person with, renewed first if it is about to expire; null when they
    // have not connected a GitHub account, or the connection no longer works.
    async use(userId: string): Promise<GithubUserToken | null> {
      const [row] = await db
        .select()
        .from(githubUserTokens)
        .where(eq(githubUserTokens.userId, userId));
      if (!row) return null;
      const fresh =
        row.accessExpiresAt === null ||
        row.accessExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS;
      if (fresh) {
        try {
          return { token: decryptSecret(row.accessTokenEncrypted), identity: identityOf(row) };
        } catch (error) {
          console.warn(`The GitHub token of user ${userId} could not be read:`, error);
          await remove(userId);
          return null;
        }
      }
      const running = renewing.get(userId) ?? renew(row).finally(() => renewing.delete(userId));
      renewing.set(userId, running);
      return running;
    },

    remove,
  };
}

export const githubUserTokenService = createGithubUserTokens();
