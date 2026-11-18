import { describe, expect, test } from "bun:test";

import { BotWorld } from "./bot-world";
import { BriefCache, ProjectBriefs } from "./project-briefs";
import type { WorldProject, WorldSource } from "./types";
import type { BotThreadView } from "@aven/protocol/types";

const projectRow = (id: string, extra: Partial<WorldProject> = {}): WorldProject => ({
  id,
  repository: `acme/${id}`,
  updatedAt: new Date("2026-01-01"),
  github: { installationId: "i1", repo: `acme/${id}` },
  ...extra,
});

const thread = (projectId: string, updatedAt: string): BotThreadView => ({
  id: crypto.randomUUID(),
  title: `Work on ${projectId}`,
  projectId,
  repository: `acme/${projectId}`,
  state: "open",
  mine: true,
  running: false,
  awaitingAnswer: false,
  pullRequests: [],
  updatedAt,
});

function world(
  options: {
    projects?: WorldProject[];
    threads?: BotThreadView[];
    file?: WorldSource["github"]["file"];
    folder?: WorldSource["github"]["folder"];
  } = {},
) {
  const asked: string[] = [];
  const source: WorldSource = {
    timezone: async () => "UTC",
    projects: async (userId) => (asked.push(userId), options.projects ?? [projectRow("web")]),
    tasks: async () => [],
    inbox: async () => [],
    github: {
      file:
        options.file ??
        (async (_i, _r, path) => ({ path, text: "AGENTS rules", truncated: false })),
      folder: options.folder ?? (async () => [{ name: "src", path: "src", type: "directory" }]),
      readme: async () => null,
    },
  };
  const briefs = new ProjectBriefs(async ({ id }) => `brief of ${id}`, new BriefCache());
  const keeper = new BotWorld(
    { list: async () => options.threads ?? [] },
    source,
    briefs,
    () => new Date("2026-11-10T12:00:00Z"),
  );
  return { keeper, asked };
}

describe("BotWorld.forReply", () => {
  test("gives the snapshot and the most recently active projects with slugs and briefs", async () => {
    const { keeper } = world({
      projects: [projectRow("a"), projectRow("b")],
      threads: [thread("b", "2026-11-10T11:00:00Z")],
    });
    const view = await keeper.forReply("u1");

    expect(view.context).toContain("Work on b");
    expect(view.projects).toEqual([
      { id: "b", slug: "b", repository: "acme/b", brief: "brief of b" },
      { id: "a", slug: "a", repository: "acme/a", brief: "brief of a" },
    ]);
  });

  test("lists at most eight projects", async () => {
    const { keeper } = world({
      projects: Array.from({ length: 12 }, (_, n) => projectRow(`p${n}`)),
    });

    expect((await keeper.forReply("u1")).projects).toHaveLength(8);
  });
});

describe("BotWorld reading a project", () => {
  test("lists a folder and reads a file of one of the person's GitHub projects, asking only for that person", async () => {
    const { keeper, asked } = world();

    expect(await keeper.folder("u1", "web", "/src/")).toEqual([
      { name: "src", path: "src", type: "directory" },
    ]);
    expect(await keeper.file("u1", "web", "/AGENTS.md")).toEqual({
      path: "AGENTS.md",
      text: "AGENTS rules",
      truncated: false,
    });
    expect(asked).toEqual(["u1", "u1"]);
  });

  test("refuses a project that is not the person's", async () => {
    const { keeper } = world();

    await expect(keeper.file("u1", "someone-elses", "README.md")).rejects.toThrow(
      "There is no project with that id",
    );
  });

  test("says only GitHub projects can be read when the project is a folder on a computer", async () => {
    const { keeper } = world({ projects: [projectRow("web", { github: undefined })] });

    await expect(keeper.folder("u1", "web")).rejects.toThrow("Only GitHub projects");
    await expect(keeper.file("u1", "web", "a.ts")).rejects.toThrow("Only GitHub projects");
  });

  test("says when a path is not there, and caps a folder's entries", async () => {
    const missing = world({ file: async () => null, folder: async () => null });

    await expect(missing.keeper.file("u1", "web", "nope.ts")).rejects.toThrow(
      'no readable text file at "nope.ts"',
    );
    await expect(missing.keeper.folder("u1", "web", "nope")).rejects.toThrow('no folder at "nope"');

    const many = world({
      folder: async () =>
        Array.from({ length: 500 }, (_, n) => ({
          name: `f${n}`,
          path: `f${n}`,
          type: "file" as const,
        })),
    });
    expect(await many.keeper.folder("u1", "web")).toHaveLength(200);
  });

  test("asks for a file at most 20,000 characters long", async () => {
    let limit = 0;
    const { keeper } = world({
      file: async (_i, _r, path, maxChars) => (
        (limit = maxChars),
        { path, text: "x", truncated: false }
      ),
    });
    await keeper.file("u1", "web", "big.txt");

    expect(limit).toBe(20_000);
  });
});
