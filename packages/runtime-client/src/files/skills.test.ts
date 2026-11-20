import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SkillStore } from "./skills";

const root = await mkdtemp(join(tmpdir(), "aven-skill-store-"));
afterAll(() => rm(root, { recursive: true, force: true }));

const skillMd = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\nSteps.`;

const archives = new Map<string, Uint8Array>();
async function publish(digest: string, files: Record<string, string>) {
  archives.set(digest, await new Bun.Archive(files, { compress: "gzip" }).bytes());
  return digest;
}

const fetched: string[] = [];
const fetch = async (digest: string) => {
  fetched.push(digest);
  const archive = archives.get(digest);

  if (!archive) throw new Error("no such skill");

  return archive;
};

test("puts a run's skills in the thread's folder, with the repository's, which win", async () => {
  const store = new SkillStore(join(root, "store"));
  const notes = await publish("1".repeat(64), {
    "SKILL.md": skillMd("notes", "Personal notes."),
    "scripts/go.sh": "#!/bin/sh\necho go",
  });
  const lint = await publish("2".repeat(64), { "SKILL.md": skillMd("lint", "Built-in lint.") });
  const broken = await publish("3".repeat(64), { "SKILL.md": "no frontmatter" });
  const workspace = join(root, "workspace");
  await mkdir(join(workspace, ".aven/skills/lint"), { recursive: true });
  await writeFile(join(workspace, ".aven/skills/lint/SKILL.md"), skillMd("lint", "The repo's."));

  const listing = await store.install(
    "t1",
    [
      { name: "notes", description: "Personal notes.", digest: notes },
      { name: "lint", description: "Built-in lint.", digest: lint },
      { name: "broken", description: "x", digest: broken },
      { name: "missing", description: "x", digest: "4".repeat(64) },
    ],
    fetch,
    workspace,
  );

  expect(listing).toEqual([
    { name: "lint", description: "The repo's.", path: "/workspace/.aven/skills/lint/SKILL.md" },
    { name: "notes", description: "Personal notes.", path: "/skills/notes/SKILL.md" },
  ]);
  const dir = await store.dir("t1");
  expect((await readdir(dir)).sort()).toEqual(["lint", "notes"]);
  expect((await stat(join(dir, "notes/scripts/go.sh"))).mode & 0o111).toBeTruthy();
});

test("fetches an archive once, and a later run's skills replace the last run's", async () => {
  const store = new SkillStore(join(root, "store-2"));
  const notes = await publish("5".repeat(64), { "SKILL.md": skillMd("notes", "Notes.") });
  fetched.length = 0;

  await store.install("t2", [{ name: "notes", description: "Notes.", digest: notes }], fetch);
  await store.install("t3", [{ name: "notes", description: "Notes.", digest: notes }], fetch);
  expect(fetched).toEqual([notes]);

  expect(await store.install("t2", [], fetch)).toEqual([]);
  expect(await readdir(await store.dir("t2"))).toEqual([]);
});

test("a name that is not one path segment, and a repository skill linking out, are left out", async () => {
  const store = new SkillStore(join(root, "store-3"));
  const escape = await publish("6".repeat(64), { "SKILL.md": skillMd("escape", "x") });
  const outside = join(root, "outside");
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "SKILL.md"), skillMd("linked", "Read from outside."));
  const workspace = join(root, "workspace-2");
  await mkdir(join(workspace, ".aven/skills/linked"), { recursive: true });
  await symlink(join(outside, "SKILL.md"), join(workspace, ".aven/skills/linked/SKILL.md"));

  const listing = await store.install(
    "t4",
    [{ name: "../escape", description: "x", digest: escape }],
    fetch,
    workspace,
  );

  expect(listing).toEqual([]);
  expect(await readdir(join(root, "store-3", "threads"))).toEqual(["t4"]);
});
