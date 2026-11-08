import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { composeCommand, composeProject, projectName } from "./compose";

const legacy = { Name: "aven", ConfigFiles: "/home/me/.aven/server/docker-compose.yml" };

let home: string;
let dir: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "aven-compose-"));
  dir = join(home, "server");
  await mkdir(dir, { recursive: true });
});
afterEach(() => rm(home, { recursive: true, force: true }));

const composeFile = () => join(dir, "docker-compose.yml");
const installFile = (name: string) => writeFile(composeFile(), `services: {}\nname: ${name}\n`);

test("names each home's project after AVEN_HOME", () => {
  expect(projectName("/home/me/.aven")).toMatch(/^aven-[0-9a-f]{8}$/);
  expect(projectName("/home/me/.aven/")).toBe(projectName("/home/me/.aven"));
  expect(projectName("/tmp/aven-test/.aven")).not.toBe(projectName("/home/me/.aven"));
});

test("points compose at the install's directory and file, under the home's own project", () => {
  expect(composeCommand(join(home, "server"), ["up", "-d"])).toEqual([
    "docker",
    "compose",
    "--project-name",
    projectName(home),
    "--project-directory",
    join(home, "server"),
    "-f",
    join(home, "server", "docker-compose.yml"),
    "up",
    "-d",
  ]);
});

test("gives a second install on the same machine a project of its own", () => {
  expect(composeProject(dir, [legacy])).toBe(projectName(home));
});

test("reads no fixed project name from the compose file an install writes, so a fresh one has its own", async () => {
  await installFile("${COMPOSE_PROJECT_NAME:-aven}");
  expect(composeProject(dir, [])).toBe(projectName(home));
});

test("keeps the aven project of an install that is already at this home, past an update of its file too", async () => {
  expect(composeProject(dir, [{ ...legacy, ConfigFiles: composeFile() }])).toBe("aven");
  await installFile("${COMPOSE_PROJECT_NAME:-aven}");
  expect(composeProject(dir, [{ ...legacy, ConfigFiles: composeFile() }])).toBe("aven");
});

test("follows the project a home's containers are already in, whatever its name", () => {
  expect(
    composeProject(dir, [{ Name: "aven-0a1b2c3d", ConfigFiles: `${composeFile()},other.yml` }]),
  ).toBe("aven-0a1b2c3d");
});

test("adopts the fixed name of a compose file written before projects were per home, when Docker cannot be asked", async () => {
  await installFile("aven");
  expect(composeProject(dir, [])).toBe("aven");
  await installFile('"aven"');
  expect(composeProject(dir, [])).toBe("aven");
});

test("has a project of its own before an install writes any compose file", async () => {
  expect(await Bun.file(composeFile()).exists()).toBe(false);
  expect(composeProject(dir, [])).toBe(projectName(home));
});
