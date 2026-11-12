import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { composeCommand, run } from "../compose";
import { avenHome, serverDir } from "../home";
import { serviceManager } from "../service-manager";
import type { Args } from "../types";

export async function uninstall(args: Args) {
  const purge = Boolean(args.flags.purge);

  if (purge && !args.flags.yes) {
    const answer = process.stdin.isTTY
      ? prompt(`This deletes the database and everything in ${avenHome()}. Type "delete" to go on:`)
      : null;

    if (answer?.trim() !== "delete")
      throw new Error("Nothing was removed. --purge needs --yes, or to be run in a terminal.");
  }

  const runner = serviceManager({
    launchdLabel: "dev.anvia.aven-runner",
    systemdUnit: "aven-runner",
  });
  await runner.uninstall();
  console.log("The runner service is removed.");

  const dir = serverDir();
  const installed = await readFile(join(dir, "docker-compose.yml")).then(
    () => true,
    () => false,
  );

  if (installed) {
    const down = ["down"];

    if (purge) down.push("--volumes");

    if ((await run(composeCommand(dir, down))) !== 0) throw new Error("docker compose down failed");

    console.log(
      purge
        ? "The server and its database are removed."
        : "The server is stopped and removed; its database is kept.",
    );
  }

  if (purge) {
    await rm(avenHome(), { recursive: true, force: true });
    console.log(`${avenHome()} is deleted.`);
  } else {
    console.log(`Settings and data stay in ${avenHome()}. Install again with: aven install`);
  }
}
