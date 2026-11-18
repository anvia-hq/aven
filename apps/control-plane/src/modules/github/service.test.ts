import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { GithubCreateNotGrantedError, type GithubClient } from "@aven/github/client";
import { createGithubService, createState, InstallationNotFoundError, readState } from "./service";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
});

describe("install state", () => {
  test("is accepted for the organization and user it was made for", () => {
    const state = createState("org-1", "user-1");
    expect(readState(state, "org-1", "user-1")).toEqual({
      next: null,
      installationId: null,
    });
  });

  test("is refused for another organization or user", () => {
    const state = createState("org-1", "user-1");
    expect(readState(state, "org-2", "user-1")).toBeNull();
    expect(readState(state, "org-1", "user-2")).toBeNull();
  });

  test("is refused when altered or expired", () => {
    const state = createState("org-1", "user-1", Date.now() - 2 * 60 * 60_000);
    expect(readState(state, "org-1", "user-1")).toBeNull();
    const [payload] = createState("org-1", "user-1").split(".");
    expect(readState(`${payload}.forged`, "org-1", "user-1")).toBeNull();
    expect(readState("garbage", "org-1", "user-1")).toBeNull();
  });
});

describe("the installation a state names", () => {
  test("comes back with the state, and only for the user it was made for", () => {
    const state = createState("org-1", "user-1", Date.now(), undefined, 42);
    expect(readState(state, "org-1", "user-1")).toEqual({
      next: null,
      installationId: 42,
    });
    expect(readState(state, "org-1", "user-2")).toBeNull();
  });

  test("is none for a state made without one", () => {
    const state = createState("org-1", "user-1", Date.now(), "/x");
    expect(readState(state, "org-1", "user-1")).toEqual({
      next: "/x",
      installationId: null,
    });
  });
});

describe("where the state sends the browser back to", () => {
  test("is the path it was made with", () => {
    const state = createState("org-1", "user-1", Date.now(), "/threads/abc?panel=diff");
    expect(readState(state, "org-1", "user-1")).toEqual({
      next: "/threads/abc?panel=diff",
      installationId: null,
    });
  });

  test("is never another site, even in a state we signed", () => {
    for (const next of ["https://evil.test/x", "//evil.test/x", "/\\evil.test", "evil"]) {
      const state = createState("org-1", "user-1", Date.now(), next);
      expect(readState(state, "org-1", "user-1")).toEqual({
        next: null,
        installationId: null,
      });
    }
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("making a repository on GitHub (real postgres, GitHub faked)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const { installation } = await seedProject(orgA, userId, null, "made");

  afterAll(cleanup);

  function fakeGithubClient(options: {
    accountType: "user" | "organization";
    selectedRepositories: boolean;
    canCreateRepositories: boolean;
    reachable: boolean;
  }) {
    const calls: { call: string; arg?: unknown }[] = [];
    const client = {
      webUrl: "https://github.test",
      installation: async () => ({
        installationId: 77,
        accountLogin: "acme",
        accountType: options.accountType,
        selectedRepositories: options.selectedRepositories,
        canCreateRepositories: options.canCreateRepositories,
      }),
      createRepository: async (_installationId: number, input: unknown) => {
        calls.push({ call: "create", arg: input });
        return {
          id: 9,
          fullName: "acme/app",
          cloneUrl: "https://github.test/acme/app.git",
          defaultBranch: "main",
          private: true,
        };
      },
      addRepositoryToInstallation: async (
        _installationId: number,
        token: string,
        repositoryId: number,
      ) => {
        calls.push({ call: "add", arg: { token, repositoryId } });
        return true;
      },
      canReach: async (_installationId: number, fullName: string) => {
        calls.push({ call: "reach", arg: fullName });
        return options.reachable;
      },
    } as unknown as GithubClient;
    const service = createGithubService(client, {
      connect: async () => ({ id: 1, login: "ada", name: null }),
      use: async () => ({ token: "ghu_ada", identity: { id: 1, login: "ada", name: null } }),
    });
    return { service, calls };
  }

  test("is made in the account of the installation and added to an installation that only reaches some repositories", async () => {
    const { service, calls } = fakeGithubClient({
      accountType: "organization",
      selectedRepositories: true,
      canCreateRepositories: true,
      reachable: true,
    });

    const made = await service.createRepository(orgA, installation.id, userId, {
      name: "app",
      private: true,
    });

    expect(made).toEqual({
      repository: {
        id: 9,
        fullName: "acme/app",
        cloneUrl: "https://github.test/acme/app.git",
        defaultBranch: "main",
        private: true,
      },
      reachable: true,
    });
    expect(calls).toEqual([
      {
        call: "create",
        arg: {
          owner: "acme",
          name: "app",
          private: true,
          accountType: "organization",
          userToken: "ghu_ada",
        },
      },
      { call: "add", arg: { token: "ghu_ada", repositoryId: 9 } },
      { call: "reach", arg: "acme/app" },
    ]);
  });

  test("is not made before the app is approved to create repositories", async () => {
    const { service, calls } = fakeGithubClient({
      accountType: "organization",
      selectedRepositories: false,
      canCreateRepositories: false,
      reachable: true,
    });

    await expect(
      service.createRepository(orgA, installation.id, userId, { name: "app", private: true }),
    ).rejects.toBeInstanceOf(GithubCreateNotGrantedError);
    expect(calls).toEqual([]);
  });

  test("is not added when the installation already reaches every repository", async () => {
    const { service, calls } = fakeGithubClient({
      accountType: "organization",
      selectedRepositories: false,
      canCreateRepositories: true,
      reachable: true,
    });

    await service.createRepository(orgA, installation.id, userId, { name: "app", private: true });

    expect(calls.map(({ call }) => call)).toEqual(["create", "reach"]);
  });

  test("says whether the app can reach the repository it made", async () => {
    const { service } = fakeGithubClient({
      accountType: "organization",
      selectedRepositories: false,
      canCreateRepositories: true,
      reachable: false,
    });

    expect(
      await service.createRepository(orgA, installation.id, userId, { name: "app", private: true }),
    ).toMatchObject({ reachable: false });
  });

  test("is refused for an installation of another workspace", async () => {
    const { service, calls } = fakeGithubClient({
      accountType: "organization",
      selectedRepositories: false,
      canCreateRepositories: true,
      reachable: true,
    });

    await expect(
      service.createRepository(orgB, installation.id, userId, { name: "app", private: true }),
    ).rejects.toBeInstanceOf(InstallationNotFoundError);
    expect(calls).toEqual([]);
  });
});
