import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BUILTIN_SKILLS_DIR, builtinSkills } from "./builtins";
import { packSkill, skillFolder } from "./package";

const b64 = (text: string) => new TextEncoder().encode(text).toBase64();
const skillMd = (name: string, description = "Does a thing. Use when asked.") =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

describe("skillFolder", () => {
  test("takes away the folder a skill was uploaded in, and what an archiver added", () => {
    const files = skillFolder([
      { path: "release-notes/SKILL.md", data: b64(skillMd("release-notes")) },
      { path: "release-notes/scripts/run.sh", data: b64("echo hi") },
      { path: "release-notes/.DS_Store", data: b64("x") },
      { path: "__MACOSX/release-notes/._SKILL.md", data: b64("x") },
    ]);
    expect([...files.keys()].sort()).toEqual(["SKILL.md", "scripts/run.sh"]);
  });

  test("refuses a path that leaves the folder, and a folder without SKILL.md", () => {
    expect(() =>
      skillFolder([
        { path: "SKILL.md", data: b64(skillMd("a")) },
        { path: "../evil", data: b64("x") },
      ]),
    ).toThrow("not a path inside");
    expect(() => skillFolder([{ path: "/etc/passwd", data: b64("x") }])).toThrow(
      "not a path inside",
    );
    expect(() => skillFolder([{ path: "a/README.md", data: b64("x") }])).toThrow("SKILL.md");
  });
});

describe("packSkill", () => {
  test("validates with Anvia and names the archive by its files", async () => {
    const files = skillFolder([{ path: "SKILL.md", data: b64(skillMd("release-notes")) }]);
    const packed = await packSkill(files);
    expect(packed).toMatchObject({
      name: "release-notes",
      description: "Does a thing. Use when asked.",
      fileCount: 1,
    });
    expect(packed.digest).toMatch(/^[0-9a-f]{64}$/);
    expect((await packSkill(files)).digest).toBe(packed.digest);

    const out = await mkdtemp(join(tmpdir(), "aven-skill-test-"));
    try {
      await new Bun.Archive(packed.archive).extract(out);
      expect(await readFile(join(out, "SKILL.md"), "utf8")).toBe(skillMd("release-notes"));
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("says why a skill is not one", async () => {
    const pack = (text: string) => packSkill(skillFolder([{ path: "SKILL.md", data: b64(text) }]));
    await expect(pack("# no frontmatter")).rejects.toThrow("frontmatter");
    await expect(pack(skillMd("Bad Name"))).rejects.toThrow("lowercase");
    await expect(pack("---\nname: ok\n---\nbody")).rejects.toThrow("description is required");
  });
});

test("every built-in skill folder packs", async () => {
  const folders = (await readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true })).flatMap((entry) =>
    entry.isDirectory() ? [entry.name] : [],
  );
  const skills = await builtinSkills();
  expect(skills.map((skill) => skill.name).sort()).toEqual(folders.sort());
});
