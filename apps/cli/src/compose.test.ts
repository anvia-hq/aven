import { expect, test } from "bun:test";

import { composeCommand } from "./compose";

test("points compose at the install's directory and file", () => {
  expect(composeCommand("/home/me/.aven/server", ["up", "-d"])).toEqual([
    "docker",
    "compose",
    "--project-directory",
    "/home/me/.aven/server",
    "-f",
    "/home/me/.aven/server/docker-compose.yml",
    "up",
    "-d",
  ]);
});
