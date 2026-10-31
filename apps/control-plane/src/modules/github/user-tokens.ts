import { db } from "@aven/db/client";
import { githubUserTokens, type GithubUserTokenRow } from "@aven/db/schema/github-user-tokens";
import type { RunGithub } from "@aven/protocol/runtime-wire";
import { eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "../../crypto";
import { github as defaultClient, type GithubClient, type GithubUserGrant } from "./client";

/** Who a connected GitHub account is: the commit identity of what the person ships (decision 0041). */
export type GithubIdentity = { id: number; login: string; name: string | null };

/** A person's usable GitHub token, and whose it is. */
export type GithubUserToken = { token: string; identity: GithubIdentity };

// A run that acts as the person keeps its token for its whole length, which can be hours, and
// GitHub cannot extend one: a token with less than this left is renewed before a run starts.
const RUN_MIN_REMAINING_MS = 2 * 60 * 60_000;

// A token is renewed when it has less than this left, so one never expires in the middle of a ship,
// which can take a few minutes (drafting, then pushing).
const REFRESH_MARGIN_MS = 10 * 60_000;

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

  // A connection that cannot work any more is forgotten: the person connects again.
  const drop = async (userId: string, reason: unknown) => {
    console.warn(`The GitHub connection of user ${userId} was dropped:`, reason);
    await remove(userId);
    return null;
  };

  // Gets a new token with the stored refresh token. A refresh token GitHub refuses, one that has
  // expired or one that cannot be read leaves the person not connected. Not reaching GitHub is
  // not a refusal: it throws and the connection stays, to be tried again.
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

  // A token to act as the person with, renewed first if it has less than `minRemainingMs` left;
  // null when they have not connected a GitHub account, or the connection no longer works.
  async function use(
    userId: string,
    minRemainingMs = REFRESH_MARGIN_MS,
  ): Promise<GithubUserToken | null> {
    const [row] = await db
      .select()
      .from(githubUserTokens)
      .where(eq(githubUserTokens.userId, userId));
    if (!row) return null;
    const fresh =
      row.accessExpiresAt === null || row.accessExpiresAt.getTime() - Date.now() > minRemainingMs;
    if (fresh) {
      try {
        return { token: decryptSecret(row.accessTokenEncrypted), identity: identityOf(row) };
      } catch (error) {
        return drop(userId, error);
      }
    }
    const running = renewing.get(userId) ?? renew(row).finally(() => renewing.delete(userId));
    renewing.set(userId, running);
    return running;
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

    use,

    // What a run acts as (decision 0044): the person's token, with enough life left for a long run,
    // and who they are. A person who has not connected GitHub, or a GitHub that cannot be reached
    // just now, gives none: the run goes on without it rather than not at all.
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
