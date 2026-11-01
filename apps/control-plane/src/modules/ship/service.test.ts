import { describe, expect, test } from "bun:test";
import type { FileContent } from "@aven/protocol/runtime-wire";
import { shipRequestOf } from "@aven/protocol/ship-request";

import { GithubNoPushAccessError, GithubWriteNotGrantedError } from "../github/client";
import type { RuntimeHub } from "../runtimes/hub";
import { createShipService, GithubNotConnectedError, shipMode } from "./service";

const threadId = "abcdef12-0000-4000-8000-000000000000";
const project = {
  githubInstallationId: "inst-1",
  repoFullName: "acme/app",
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

// A ship with what it asks of faked: who is connected, what GitHub allows, the runner's file.
function setup(
  options: {
    connected?: boolean;
    approved?: boolean;
    canPush?: boolean;
    file?: () => Promise<FileContent | null>;
    pullRequests?: (typeof project)["pullRequests"];
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
  const service = createShipService({} as RuntimeHub, {
    load: async () => ({ ...project, pullRequests: options.pullRequests ?? [] }),
    userTokens: {
      use: async () =>
        connected ? { token: "ghu_a", identity: { id: 42, login: "ada", name: null } } : null,
    },
    github: {
      requireWritable: async () => {
        checked.push("writable");
        if (!approved) throw new GithubWriteNotGrantedError("acme");
      },
      requirePush: async (token, fullName) => {
        checked.push(`push ${token} ${fullName}`);
        if (!canPush) throw new GithubNoPushAccessError(fullName);
      },
    },
    readShipFile: options.file ?? (async () => null),
    send: async (organizationId, userId, id, body) => {
      sent.push({ organizationId, userId, threadId: id, ...body });
    },
  });
  return { service, sent, checked };
}

describe("shipping a thread", () => {
  test("sends the thread's agent the ship prompt, as the person who pressed the button", async () => {
    const { service, sent, checked } = setup();

    await service.ship("org-1", "user-1", threadId);

    expect(checked).toEqual(["writable", "push ghu_a acme/app"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ organizationId: "org-1", userId: "user-1", threadId });
    // The branch the thread works on and the repository's own default branch.
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
    expect(checked).toEqual([]);
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
    // The mode is for the prompt; the rest is the model the thread is on.
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
