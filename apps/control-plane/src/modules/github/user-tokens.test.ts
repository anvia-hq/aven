import { afterAll, describe, expect, test } from "bun:test";

import type * as CryptoModule from "../../crypto";
import type { GithubClient } from "./client";
import type { GithubUserGrant } from "./types";

const only = (client: Pick<GithubClient, "userProfile" | "refreshGrant">) => ({
  forKey: async () => client as GithubClient,
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a person's GitHub connection (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { githubUserTokens } = await import("@aven/db/schema/github-user-tokens");
  const { users } = await import("@aven/db/schema/users");
  const { eq, inArray } = await import("drizzle-orm");
  const { createGithubUserTokens } = await import("./user-tokens");

  const suffix = crypto.randomUUID().slice(0, 8);
  const ids: string[] = [];
  const profile = { id: 42, login: "ada", name: "Ada L" };
  const grant = (over: Partial<GithubUserGrant> = {}): GithubUserGrant => ({
    accessToken: "ghu_one",
    expiresAt: Date.now() + 8 * 3_600_000,
    refreshToken: "ghr_one",
    refreshExpiresAt: Date.now() + 180 * 86_400_000,
    ...over,
  });

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

  const encryptWithAnotherKey = async (plain: string) => {
    const previous = process.env.PROVIDER_ENCRYPTION_KEY;
    process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString("base64");
    try {
      const { encryptSecret } = (await import(
        `../../crypto.ts?key=${crypto.randomUUID()}`
      )) as typeof CryptoModule;
      return encryptSecret(plain);
    } finally {
      if (previous === undefined) delete process.env.PROVIDER_ENCRYPTION_KEY;
      else process.env.PROVIDER_ENCRYPTION_KEY = previous;
    }
  };

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, ids));
  });

  test("is not connected until the person connects, and then is, with the tokens only encrypted", async () => {
    const id = await person("a");
    const tokens = createGithubUserTokens(only(fakeClient(() => null).client));
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
    const tokens = createGithubUserTokens(only(fakeClient(() => null).client));
    await tokens.connect(id, grant());

    await tokens.connect(id, grant({ accessToken: "ghu_two" }));

    expect((await tokens.use(id))?.token).toBe("ghu_two");
  });

  test("a token about to expire is renewed once, however many ask at the same time", async () => {
    const id = await person("c");
    const github = fakeClient(() => grant({ accessToken: "ghu_new", refreshToken: "ghr_new" }));
    const tokens = createGithubUserTokens(only(github.client));
    await tokens.connect(id, grant({ expiresAt: Date.now() + 5_000 }));

    const used = await Promise.all([tokens.use(id), tokens.use(id), tokens.use(id)]);

    expect(used.map((entry) => entry?.token)).toEqual(["ghu_new", "ghu_new", "ghu_new"]);
    expect(github.refreshed).toEqual(["ghr_one"]);
    expect((await tokens.use(id))?.token).toBe("ghu_new");
    const [row] = await db.select().from(githubUserTokens).where(eq(githubUserTokens.userId, id));
    expect(row!.accessExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 3_600_000);
  });

  test("a token that does not expire is never renewed", async () => {
    const id = await person("d");
    const github = fakeClient(() => null);
    const tokens = createGithubUserTokens(only(github.client));
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
    const tokens = createGithubUserTokens(only(github.client));
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

  test("a GitHub that cannot be reached keeps the connection, and a later try renews it", async () => {
    const id = await person("h");
    let down = true;
    const refreshed: string[] = [];
    const tokens = createGithubUserTokens(
      only({
        userProfile: async () => profile,
        refreshGrant: async (token) => {
          refreshed.push(token);

          if (down) throw new Error("GitHub is down");

          return grant({ accessToken: "ghu_back", refreshToken: "ghr_back" });
        },
      }),
    );
    await tokens.connect(id, grant({ expiresAt: Date.now() + 5_000 }));

    await expect(tokens.use(id)).rejects.toThrow("GitHub is down");
    expect(await tokens.status(id)).toEqual({ login: "ada" });

    down = false;
    expect((await tokens.use(id))?.token).toBe("ghu_back");
    expect(refreshed).toEqual(["ghr_one", "ghr_one"]);
  });

  test("a token with minutes left is renewed before a ship that could outlast it", async () => {
    const id = await person("i");
    const github = fakeClient(() => grant({ accessToken: "ghu_new", refreshToken: "ghr_new" }));
    const tokens = createGithubUserTokens(only(github.client));
    await tokens.connect(id, grant({ expiresAt: Date.now() + 5 * 60_000 }));

    expect((await tokens.use(id))?.token).toBe("ghu_new");
    expect(github.refreshed).toEqual(["ghr_one"]);
  });

  test("a run acts as the person: their token and who they are, renewed first if it would not last", async () => {
    const id = await person("j");
    const github = fakeClient(() => grant({ accessToken: "ghu_long", refreshToken: "ghr_long" }));
    const tokens = createGithubUserTokens(only(github.client));
    expect(await tokens.forRun(id)).toBeUndefined();

    await tokens.connect(
      id,
      grant({ accessToken: "ghu_ok", expiresAt: Date.now() + 5 * 3_600_000 }),
    );
    expect(await tokens.forRun(id)).toEqual({
      token: "ghu_ok",
      id: 42,
      login: "ada",
      name: "Ada L",
    });
    expect(github.refreshed).toEqual([]);

    await tokens.connect(
      id,
      grant({ accessToken: "ghu_short", expiresAt: Date.now() + 3_600_000 }),
    );
    expect((await tokens.forRun(id))?.token).toBe("ghu_long");
    expect(github.refreshed).toEqual(["ghr_one"]);
  });

  test("a GitHub that cannot be reached gives a run no GitHub, and the connection stays", async () => {
    const id = await person("k");
    const silenced = console.warn;
    console.warn = () => undefined;
    const tokens = createGithubUserTokens(
      only({
        userProfile: async () => profile,
        refreshGrant: async () => {
          throw new Error("GitHub is down");
        },
      }),
    );
    await tokens.connect(id, grant({ expiresAt: Date.now() + 3_600_000 }));

    expect(await tokens.forRun(id)).toBeUndefined();

    console.warn = silenced;
    expect(await tokens.status(id)).toEqual({ login: "ada" });
  });

  test("a token written with another key leaves the person not connected", async () => {
    const id = await person("g");
    const tokens = createGithubUserTokens(only(fakeClient(() => null).client));
    await tokens.connect(id, grant());

    await db
      .update(githubUserTokens)
      .set({
        accessTokenEncrypted: await encryptWithAnotherKey("ghu_one"),
        refreshTokenEncrypted: await encryptWithAnotherKey("ghr_one"),
      })
      .where(eq(githubUserTokens.userId, id));

    expect(await tokens.use(id)).toBeNull();
    expect(await tokens.status(id)).toBeNull();
  });
});
