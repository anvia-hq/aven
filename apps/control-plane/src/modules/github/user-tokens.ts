import { db } from "@aven/db/client";
import { githubUserTokens, type GithubUserTokenRow } from "@aven/db/schema/github-user-tokens";
import type { RunGithub } from "@aven/protocol/runtime-wire";
import { and, eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "../../crypto";
import type { GithubUserGrant } from "./client";
import { githubClients, PLATFORM_APP, type GithubClients } from "./clients";

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

const ofPerson = (userId: string, appKey: string) =>
  and(eq(githubUserTokens.userId, userId), eq(githubUserTokens.appKey, appKey));

// The GitHub accounts people have connected (decision 0041), one for each app, since a user token
// is one app's (decision 0123). A user token lasts eight hours; it is renewed when it is used. A
// refresh token works once, so one renewal runs at a time per person and app.
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

  // A connection that cannot work any more is forgotten: the person connects again.
  const drop = async (userId: string, appKey: string, reason: unknown) => {
    console.warn(`The GitHub connection of user ${userId} (app ${appKey}) was dropped:`, reason);
    await remove(userId, appKey);
    return null;
  };

  // Gets a new token with the stored refresh token. A refresh token GitHub refuses, one that has
  // expired or one that cannot be read leaves the person not connected. Not reaching GitHub is
  // not a refusal: it throws and the connection stays, to be tried again.
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

  // A token to act as the person with for an app, renewed first if it has less than
  // `minRemainingMs` left; null when they have not connected a GitHub account for it, or the
  // connection no longer works.
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
    // Connects the account a grant belongs to, or reconnects it.
    async connect(userId: string, grant: GithubUserGrant, appKey: string = PLATFORM_APP) {
      const profile = await (await clients.forKey(appKey)).userProfile(grant.accessToken);
      await store(userId, appKey, grant, profile);
      return profile;
    },

    /** The connected account's login for an app, or null when the person has not connected one. */
    async status(userId: string, appKey: string = PLATFORM_APP): Promise<{ login: string } | null> {
      const [row] = await db
        .select({ login: githubUserTokens.login })
        .from(githubUserTokens)
        .where(ofPerson(userId, appKey));
      return row ?? null;
    },

    use,

    // What a run acts as (decision 0044): the person's token, with enough life left for a long run,
    // and who they are. A person who has not connected GitHub, or a GitHub that cannot be reached
    // just now, gives none: the run goes on without it rather than not at all.
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
