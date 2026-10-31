import { describe, expect, test } from "bun:test";
import type { FileContent } from "@aven/protocol/runtime-wire";
import { shipRequestOf } from "@aven/protocol/ship-request";

import { GithubNoPushAccessError, GithubWriteNotGrantedError } from "../github/client";
import type { RuntimeHub } from "../runtimes/hub";
import { createShipService, GithubNotConnectedError } from "./service";

const threadId = "abcdef12-0000-4000-8000-000000000000";
const project = {
  githubInstallationId: "inst-1",
  repoFullName: "acme/app",
  defaultBranch: "develop",
};

// A ship with what it asks of faked: who is connected, what GitHub allows, the runner's file.
function setup(
  options: {
    connected?: boolean;
    approved?: boolean;
    canPush?: boolean;
    file?: () => Promise<FileContent | null>;
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
    load: async () => project,
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
});
