import { describe, expect, test } from "bun:test";
import { shipRequestOf } from "@aven/protocol/ship-request";

import { GithubNoPushAccessError, GithubWriteNotGrantedError } from "@aven/github/client";
import type { RuntimeHub } from "../runtimes/hub";
import { createShipService, GithubNotConnectedError, shipMode } from "./service";
import type { FileContent } from "@aven/protocol/types";

const threadId = "abcdef12-0000-4000-8000-000000000000";
const project = {
  githubInstallationId: "inst-1",
  repoFullName: "acme/app",
  directory: null as string | null,
  defaultBranch: "develop",
  pullRequests: [] as {
    number: number;
    url: string;
    branch: string;
    title: string;
    state: "open" | "closed" | "merged";
  }[],
};
const pull = (number: number, state: "open" | "closed" | "merged") => ({
  number,
  url: `https://github.com/acme/app/pull/${number}`,
  branch: "aven/abcdef12",
  title: `Pull ${number}`,
  state,
});

function setup(
  options: {
    connected?: boolean;
    approved?: boolean;
    canPush?: boolean;
    file?: () => Promise<FileContent | null>;
    has?: string[];
    pullRequests?: (typeof project)["pullRequests"];
    installation?: string | null;
    directory?: string | null;
    githubMode?: "machine" | "person";
    runner?: { login: string | null };
  } = {},
) {
  const { connected = true, approved = true, canPush = true } = options;
  const sent: {
    organizationId: string;
    userId: string;
    threadId: string;
    prompt: string;
    providerId?: string;
    modelId?: string;
  }[] = [];
  const checked: string[] = [];
  const hub = { get: () => (options.runner ? { github: options.runner } : undefined) };
  const service = createShipService(hub as unknown as RuntimeHub, {
    load: async () => ({
      ...project,
      githubInstallationId: options.installation === undefined ? "inst-1" : options.installation,
      pullRequests: options.pullRequests ?? [],
      directory: options.directory ?? null,
      githubMode: options.githubMode ?? "machine",
      runtimeId: "runtime-1",
    }),
    userTokens: {
      use: async (_userId, appKey) => {
        checked.push(`connection for ${appKey}`);
        return connected
          ? { token: "ghu_a", identity: { id: 42, login: "ada", name: null } }
          : null;
      },
    },
    github: {
      appKeyOf: async () => "app-1",
      requireWritable: async () => {
        checked.push("writable");

        if (!approved) throw new GithubWriteNotGrantedError("acme");
      },
      requirePush: async (_installation, token, fullName) => {
        checked.push(`push ${token} ${fullName}`);

        if (!canPush) throw new GithubNoPushAccessError(fullName);
      },
    },
    readShipFile: options.file ?? (async () => null),
    hasFile: async (_org, _thread, path) => (options.has ?? []).includes(path),
    send: async (organizationId, userId, id, body) => {
      sent.push({ organizationId, userId, threadId: id, ...body });
    },
  });
  return { service, sent, checked };
}

describe("whether a thread's repository is set up to ship (decision 0083)", () => {
  test("is ready with the way of shipping", async () => {
    const shipping = setup({ has: [".aven/ship.md"] });
    expect(await shipping.service.readiness("org-1", threadId)).toEqual({
      ready: true,
      ship: true,
      appKey: "app-1",
      machine: false,
      githubMode: "machine",
      runnerGithub: null,
    });

    const neither = setup();
    expect(await neither.service.readiness("org-1", threadId)).toEqual({
      ready: false,
      ship: false,
      appKey: "app-1",
      machine: false,
      githubMode: "machine",
      runnerGithub: null,
    });
  });

  test("a project with no GitHub app ships with the runner's own login, if the runner is persistent", async () => {
    const persistent = setup({ installation: null, has: [".aven/ship.md"] });
    expect(await persistent.service.readiness("org-1", threadId)).toMatchObject({
      ready: true,
      machine: true,
    });

    const person = setup({ installation: null, githubMode: "person" });
    expect(await person.service.readiness("org-1", threadId)).toMatchObject({
      machine: false,
      appKey: "platform",
      githubMode: "person",
    });
  });

  test("says which GitHub login the thread's runner has, or nothing when it is offline or did not say", async () => {
    const signedIn = setup({ runner: { login: "indrazm" } });
    expect((await signedIn.service.readiness("org-1", threadId)).runnerGithub).toEqual({
      login: "indrazm",
    });

    const signedOut = setup({ runner: { login: null } });
    expect((await signedOut.service.readiness("org-1", threadId)).runnerGithub).toEqual({
      login: null,
    });

    const offline = setup();
    expect((await offline.service.readiness("org-1", threadId)).runnerGithub).toBeNull();
  });

  test("is asked of a thread of the organization only", async () => {
    const asked: string[] = [];
    const service = createShipService({} as RuntimeHub, {
      load: async () => {
        throw new Error("Thread not found");
      },
      hasFile: async (_org, _thread, path) => (asked.push(path), true),
      send: async () => undefined,
    });

    await expect(service.readiness("org-2", threadId)).rejects.toThrow("Thread not found");
    expect(asked).toEqual([]);
  });
});

describe("shipping a thread", () => {
  test("a folder project's prompt says origin is the folder and how to push on to GitHub", async () => {
    const { service, sent } = setup({ installation: null, directory: "/home/ada/app" });

    await service.ship("org-1", "user-1", threadId);

    expect(sent[0]!.prompt).toContain("origin here is that folder, not GitHub");
    expect(sent[0]!.prompt).toContain("git -C /home/ada/app remote -v");
  });

  test("a project with no GitHub app ships on a persistent runner without a GitHub check", async () => {
    const { service, sent, checked } = setup({ installation: null });

    await service.ship("org-1", "user-1", threadId);

    expect(checked).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test("a project with no GitHub app on a runner in person mode needs the person's own connection", async () => {
    const connected = setup({ installation: null, githubMode: "person" });

    await connected.service.ship("org-1", "user-1", threadId);

    expect(connected.checked).toEqual(["connection for platform"]);
    expect(connected.sent).toHaveLength(1);

    const missing = setup({ installation: null, githubMode: "person", connected: false });

    await expect(missing.service.ship("org-1", "user-1", threadId)).rejects.toBeInstanceOf(
      GithubNotConnectedError,
    );
    expect(missing.sent).toEqual([]);
  });

  test("sends the thread's agent the ship prompt, as the person who pressed the button", async () => {
    const { service, sent, checked } = setup();

    await service.ship("org-1", "user-1", threadId);

    expect(checked).toEqual(["connection for app-1", "writable", "push ghu_a acme/app"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ organizationId: "org-1", userId: "user-1", threadId });
    expect(sent[0]!.prompt).toContain("git fetch origin develop");
    expect(sent[0]!.prompt).toContain("This thread's branch is aven/abcdef12");
  });

  test("runs on the model the thread is on, when the button says which", async () => {
    const { service, sent } = setup();

    await service.ship("org-1", "user-1", threadId, { providerId: "p", modelId: "m" });

    expect(sent[0]).toMatchObject({ providerId: "p", modelId: "m" });
  });

  test("sends the repository's own prompt when it has .aven/ship.md", async () => {
    const { service, sent } = setup({
      file: async () => ({
        kind: "text",
        text: "Squash, then use our merge queue.",
        size: 33,
        truncated: false,
      }),
    });

    await service.ship("org-1", "user-1", threadId);

    expect(shipRequestOf(sent[0]!.prompt)?.startsWith("Squash, then use our merge queue.")).toBe(
      true,
    );
  });

  test("a person who has not connected GitHub is told to, and nothing is sent", async () => {
    const { service, sent, checked } = setup({ connected: false });

    await expect(service.ship("org-1", "user-1", threadId)).rejects.toBeInstanceOf(
      GithubNotConnectedError,
    );

    expect(sent).toEqual([]);
    expect(checked).toEqual(["connection for app-1"]);
  });

  test("an app that is not approved to write, or a person who cannot push, is a 409 and nothing is sent", async () => {
    const unapproved = setup({ approved: false });
    await expect(unapproved.service.ship("org-1", "user-1", threadId)).rejects.toBeInstanceOf(
      GithubWriteNotGrantedError,
    );
    expect(unapproved.sent).toEqual([]);

    const readOnly = setup({ canPush: false });
    await expect(readOnly.service.ship("org-1", "user-1", threadId)).rejects.toBeInstanceOf(
      GithubNoPushAccessError,
    );
    expect(readOnly.sent).toEqual([]);
  });

  test("a ship file that cannot be sent stops the ship before the agent hears of it", async () => {
    const { service, sent } = setup({ file: async () => ({ kind: "binary", size: 9 }) });

    await expect(service.ship("org-1", "user-1", threadId)).rejects.toThrow("not a text file");

    expect(sent).toEqual([]);
  });

  test("the first ship is the thread's own branch, whatever mode is asked", async () => {
    const { service, sent } = setup();

    await service.ship("org-1", "user-1", threadId, { mode: "new" });

    expect(sent[0]!.prompt).not.toContain("git switch -c");
    expect(sent[0]!.prompt).toContain("gh pr create --draft");
  });

  test("a thread with an open pull request updates it, unless the person asks for a new one", async () => {
    const { service, sent } = setup({ pullRequests: [pull(7, "open")] });

    await service.ship("org-1", "user-1", threadId);
    await service.ship("org-1", "user-1", threadId, { mode: "new", providerId: "p", modelId: "m" });

    expect(sent[0]!.prompt).toContain("updated by the push: do not open another");
    expect(sent[1]!.prompt).toContain("git switch -c aven/abcdef12-<short-slug> origin/develop");
    expect(sent[1]).toMatchObject({ providerId: "p", modelId: "m" });
    expect(sent[1]).not.toHaveProperty("mode");
  });

  test("a thread whose latest pull request is merged opens a new one", async () => {
    const { service, sent } = setup({ pullRequests: [pull(7, "merged")] });

    await service.ship("org-1", "user-1", threadId);

    expect(sent[0]!.prompt).toContain("git switch -c aven/abcdef12-<short-slug> origin/develop");
    expect(sent[0]!.prompt).toContain("- #7 merged");
  });
});

describe("what a ship does with the pull requests", () => {
  test("none yet is the first; otherwise the person's word, else the newest pull request's state", () => {
    expect(shipMode(undefined, [])).toBe("first");
    expect(shipMode("update", [])).toBe("first");
    expect(shipMode(undefined, [{ state: "open" }, { state: "merged" }])).toBe("update");
    expect(shipMode(undefined, [{ state: "merged" }, { state: "open" }])).toBe("new");
    expect(shipMode(undefined, [{ state: "closed" }])).toBe("new");
    expect(shipMode("new", [{ state: "open" }])).toBe("new");
    expect(shipMode("update", [{ state: "merged" }])).toBe("update");
  });
});
