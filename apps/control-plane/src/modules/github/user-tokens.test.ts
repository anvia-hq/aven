import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { GithubUserGrant } from "./client";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a person's GitHub connection (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { githubUserTokens } = await import("@aven/db/schema/github-user-tokens");
  const { users } = await import("@aven/db/schema/users");
  const { eq, inArray } = await import("drizzle-orm");
  const { createGithubUserTokens } = await import("./user-tokens");

  const suffix = crypto.randomUUID().slice(0, 8);
  const ids: string[] = [];
  let previousKey: string | undefined;

  const profile = { id: 42, login: "ada", name: "Ada L" };
  const grant = (over: Partial<GithubUserGrant> = {}): GithubUserGrant => ({
    accessToken: "ghu_one",
    expiresAt: Date.now() + 8 * 3_600_000,
    refreshToken: "ghr_one",
    refreshExpiresAt: Date.now() + 180 * 86_400_000,
    ...over,
  });

  // A GitHub that hands out the next refresh grant, or refuses with null, and counts the calls.
  function fakeClient(refresh: (token: string) => GithubUserGrant | null) {
    const refreshed: string[] = [];
    return {
      refreshed,
      client: {
        userProfile: async () => profile,
        refreshGrant: async (token: string) => {
          refreshed.push(token);
          await Bun.sleep(10);
          return refresh(token);
        },
      },
    };
  }

  async function person(name: string) {
    const id = `u-${name}-${suffix}`;
    ids.push(id);
    await db.insert(users).values({ id, name, email: `${id}@aven.test` });
    return id;
  }

  beforeAll(() => {
    previousKey = process.env.PROVIDER_ENCRYPTION_KEY;
    process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  });

  afterAll(async () => {
    process.env.PROVIDER_ENCRYPTION_KEY = previousKey;
    await db.delete(users).where(inArray(users.id, ids));
  });

  test("is not connected until the person connects, and then is, with the tokens only encrypted", async () => {
    const id = await person("a");
    const tokens = createGithubUserTokens(fakeClient(() => null).client);
    expect(await tokens.status(id)).toBeNull();
    expect(await tokens.use(id)).toBeNull();

    await tokens.connect(id, grant());

    expect(await tokens.status(id)).toEqual({ login: "ada" });
    expect(await tokens.use(id)).toEqual({ token: "ghu_one", identity: profile });
    const [row] = await db.select().from(githubUserTokens).where(eq(githubUserTokens.userId, id));
    expect(JSON.stringify(row)).not.toContain("ghu_one");
    expect(JSON.stringify(row)).not.toContain("ghr_one");
  });

  test("connecting again replaces the account", async () => {
    const id = await person("b");
    const tokens = createGithubUserTokens(fakeClient(() => null).client);
    await tokens.connect(id, grant());

    await tokens.connect(id, grant({ accessToken: "ghu_two" }));

    expect((await tokens.use(id))?.token).toBe("ghu_two");
  });

  test("a token about to expire is renewed once, however many ask at the same time", async () => {
    const id = await person("c");
    const github = fakeClient(() => grant({ accessToken: "ghu_new", refreshToken: "ghr_new" }));
    const tokens = createGithubUserTokens(github.client);
    await tokens.connect(id, grant({ expiresAt: Date.now() + 5_000 }));

    const used = await Promise.all([tokens.use(id), tokens.use(id), tokens.use(id)]);

    expect(used.map((entry) => entry?.token)).toEqual(["ghu_new", "ghu_new", "ghu_new"]);
    expect(github.refreshed).toEqual(["ghr_one"]);
    // The new refresh token is the one kept, since the old one works once.
    expect((await tokens.use(id))?.token).toBe("ghu_new");
    const [row] = await db.select().from(githubUserTokens).where(eq(githubUserTokens.userId, id));
    expect(row!.accessExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 3_600_000);
  });

  test("a token that does not expire is never renewed", async () => {
    const id = await person("d");
    const github = fakeClient(() => null);
    const tokens = createGithubUserTokens(github.client);
    await tokens.connect(
      id,
      grant({ expiresAt: null, refreshToken: null, refreshExpiresAt: null }),
    );

    expect((await tokens.use(id))?.token).toBe("ghu_one");
    expect(github.refreshed).toEqual([]);
  });

  test("a refresh GitHub refuses, or a refresh token that has expired, leaves the person not connected", async () => {
    const refused = await person("e");
    const github = fakeClient(() => null);
    const tokens = createGithubUserTokens(github.client);
    await tokens.connect(refused, grant({ expiresAt: Date.now() - 1000 }));
    expect(await tokens.use(refused)).toBeNull();
    expect(await tokens.status(refused)).toBeNull();

    const lapsed = await person("f");
    await tokens.connect(
      lapsed,
      grant({ expiresAt: Date.now() - 1000, refreshExpiresAt: Date.now() - 1000 }),
    );
    expect(await tokens.use(lapsed)).toBeNull();
    expect(github.refreshed).toEqual(["ghr_one"]);
  });

  test("a token that cannot be read (the key changed) leaves the person not connected", async () => {
    const id = await person("g");
    const tokens = createGithubUserTokens(fakeClient(() => null).client);
    await tokens.connect(id, grant());

    process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString("base64");
    expect(await tokens.use(id)).toBeNull();
    process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");

    expect(await tokens.status(id)).toBeNull();
  });
});
