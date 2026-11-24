import { describe, expect, test } from "bun:test";
import { packSkill } from "@aven/agents/skill-package";

import { parseSkillSource, resolveSkill, skillCandidates } from "./install";

const skillMd = (name: string) =>
  `---\nname: ${name}\ndescription: Does a thing. Use when asked.\n---\n\n# ${name}\n`;

type FakeFile = { path: string; content: string; mode?: string };

function filesOf(source: Record<string, string>): FakeFile[] {
  return Object.entries(source).map(([path, content]) => ({ path, content }));
}

function github(files: FakeFile[]) {
  const entries = files.map((file, index) => ({
    ...file,
    mode: file.mode ?? "100644",
    sha: `sha${index}`,
  }));
  const asked: string[] = [];
  const authorizations: (string | null)[] = [];

  const fetch = async (url: string, init?: RequestInit) => {
    asked.push(url);
    authorizations.push(new Headers(init?.headers).get("authorization"));

    if (url.includes("/git/trees/"))
      return Response.json({
        tree: entries.map(({ path, mode, content, sha }) => ({
          path,
          mode,
          sha,
          type: "blob",
          size: content.length,
        })),
      });

    const sha = /\/git\/blobs\/(.+)$/.exec(url)?.[1];
    const entry = entries.find((file) => file.sha === sha);

    if (!entry) return new Response("", { status: 404 });

    return Response.json({
      content: Buffer.from(entry.content).toString("base64"),
      encoding: "base64",
    });
  };

  return { fetch, asked, authorizations };
}

const repo = {
  "skills/code-review/SKILL.md": skillMd("code-review"),
  "skills/release-notes/SKILL.md": skillMd("release-notes"),
  "skills/release-notes/scripts/run.sh": "echo hi\n",
};

describe("parseSkillSource", () => {
  test("reads a repository, a skill named after an @, and the links people copy", () => {
    expect(parseSkillSource("vercel-labs/agent-skills")).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
      ref: null,
      folder: null,
      name: null,
    });
    expect(parseSkillSource(" vercel-labs/agent-skills@web-design-guidelines ")).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
      ref: null,
      folder: null,
      name: "web-design-guidelines",
    });
    expect(
      parseSkillSource("https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design"),
    ).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
      ref: "main",
      folder: "skills/web-design",
      name: null,
    });
    expect(
      parseSkillSource("https://github.com/vercel-labs/agent-skills/blob/main/skills/web/SKILL.md"),
    ).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
      ref: "main",
      folder: "skills/web",
      name: null,
    });
    expect(parseSkillSource("git@github.com:vercel-labs/agent-skills.git")).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
      ref: null,
      folder: null,
      name: null,
    });
    expect(parseSkillSource("https://www.skills.sh/vercel-labs/agent-skills/web-design")).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
      ref: null,
      folder: null,
      name: "web-design",
    });
    expect(
      parseSkillSource(
        "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web/SKILL.md",
      ),
    ).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
      ref: "main",
      folder: "skills/web",
      name: null,
    });
  });

  test("refuses a folder on a computer, a pack, and an address it cannot read", () => {
    expect(() => parseSkillSource("./my-skill")).toThrow("uploaded, not installed");
    expect(() => parseSkillSource("/Users/me/skills/my-skill")).toThrow("uploaded, not installed");
    expect(() => parseSkillSource("https://skills.sh/p/web-design")).toThrow("pack");
    expect(() => parseSkillSource("https://example.com/my-skill.zip")).toThrow("owner/repo");
    expect(() => parseSkillSource("not a link")).toThrow("owner/repo");
    expect(() => parseSkillSource("   ")).toThrow("owner/repo");
  });
});

describe("skillCandidates", () => {
  test("finds the folders that hold a SKILL.md, and leaves a symlink and a dependency out", () => {
    const tree = [
      { path: "skills/code-review/SKILL.md", mode: "100644", type: "blob", sha: "a" },
      {
        path: "skills/code-review/references/checklist.md",
        mode: "100644",
        type: "blob",
        sha: "b",
      },
      { path: ".claude/skills/code-review/SKILL.md", mode: "120000", type: "blob", sha: "c" },
      { path: "node_modules/x/SKILL.md", mode: "100644", type: "blob", sha: "d" },
      { path: "SKILL.md", mode: "100644", type: "blob", sha: "e" },
    ];

    expect(skillCandidates(tree, "agent-skills")).toEqual([
      { name: "agent-skills", folder: "" },
      { name: "code-review", folder: "skills/code-review" },
    ]);
  });
});

describe("resolveSkill", () => {
  test("reads a named skill's files out of the repository", async () => {
    const fake = github(filesOf(repo));
    const resolved = await resolveSkill("owner/repo@release-notes", { fetch: fake.fetch });

    if (resolved.status !== "skill") throw new Error("expected a skill");

    expect([...resolved.files.keys()].sort()).toEqual(["SKILL.md", "scripts/run.sh"]);
    expect((await packSkill(resolved.files)).name).toBe("release-notes");
    expect(fake.asked[0]).toBe(
      "https://api.github.com/repos/owner/repo/git/trees/HEAD?recursive=1",
    );
  });

  test("asks which one a repository of several holds", async () => {
    const resolved = await resolveSkill("owner/repo", { fetch: github(filesOf(repo)).fetch });

    expect(resolved).toEqual({
      status: "choose",
      choices: [
        { name: "code-review", folder: "skills/code-review" },
        { name: "release-notes", folder: "skills/release-notes" },
      ],
    });
  });

  test("installs a repository whose SKILL.md is at its top", async () => {
    const fake = github(
      filesOf({ "SKILL.md": skillMd("top-level"), "scripts/run.sh": "echo hi\n" }),
    );
    const resolved = await resolveSkill("owner/repo", { fetch: fake.fetch });

    if (resolved.status !== "skill") throw new Error("expected a skill");

    expect([...resolved.files.keys()].sort()).toEqual(["SKILL.md", "scripts/run.sh"]);
    expect(resolved.folder).toBe("");
  });

  test("takes the skill a link points inside of, at the ref the link names", async () => {
    const fake = github(filesOf(repo));
    const resolved = await resolveSkill(
      "https://github.com/owner/repo/tree/v1.2.0/skills/release-notes/scripts",
      { fetch: fake.fetch },
    );

    if (resolved.status !== "skill") throw new Error("expected a skill");

    expect(resolved.folder).toBe("skills/release-notes");
    expect(fake.asked[0]).toBe(
      "https://api.github.com/repos/owner/repo/git/trees/v1.2.0?recursive=1",
    );
  });

  test("says which skills a repository has when the one asked for is not there", async () => {
    await expect(
      resolveSkill("owner/repo@design-review", { fetch: github(filesOf(repo)).fetch }),
    ).rejects.toThrow("has no skill named design-review. It has: code-review, release-notes");
  });

  test("reads a private repository as the person who connected GitHub", async () => {
    const fake = github(filesOf(repo));
    await resolveSkill("owner/repo@release-notes", { fetch: fake.fetch, token: "ghp_fake" });

    expect(fake.authorizations).toEqual(["Bearer ghp_fake", "Bearer ghp_fake", "Bearer ghp_fake"]);
  });

  test("refuses a skill of more files than one may have", async () => {
    const many = Array.from({ length: 201 }, (_, index) => ({
      path: `skills/big/references/${index}.md`,
      content: "x",
    }));
    const fake = github([...many, { path: "skills/big/SKILL.md", content: skillMd("big") }]);

    await expect(resolveSkill("owner/repo@big", { fetch: fake.fetch })).rejects.toThrow(
      "at most 200 files",
    );
  });

  test("says so when GitHub has no such repository", async () => {
    const fetch = async () => new Response("", { status: 404 });

    await expect(resolveSkill("owner/missing", { fetch })).rejects.toThrow(
      "GitHub has no owner/missing this account can read",
    );
  });
});
