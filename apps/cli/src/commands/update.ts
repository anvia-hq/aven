import { stringFlag } from "../args";
import { run } from "../compose";
import {
  clearPendingUpdate,
  pendingUpdateFile,
  readPendingUpdate,
  writePendingUpdate,
} from "../pending-update";
import { downloadVerified, installBinary, latestVersion, platformName } from "../release";
import { removeStaleImages } from "../prune-images";
import { version } from "../version";
import { runnerUpgrade } from "./runner";
import { serverUpgrade } from "./server";
import type { Args } from "../types";

type UpdateStep = "finish" | "current" | "replace";

export function updateStep(options: {
  version: string;
  wanted: string;
  force: boolean;
  pending: { to: string } | undefined;
}): UpdateStep {
  if (options.pending?.to === options.version) return "finish";
  if (options.wanted === options.version && !options.force) return "current";
  return "replace";
}

export async function update(args: Args) {
  if (args.flags.finish) return finish();
  if (version === "dev")
    throw new Error("This is a development build of aven and cannot update itself.");

  const wanted = stringFlag(args, "release")?.replace(/^v/, "") ?? (await latestVersion());
  const marker = pendingUpdateFile();
  const pending = await readPendingUpdate(marker);
  const step = updateStep({ version, wanted, force: Boolean(args.flags.force), pending });
  if (step === "current") {
    console.log(`aven ${version} is up to date.`);
    return;
  }
  if (step === "finish") {
    console.log(`The update to aven ${version} stopped before it finished. Finishing it.`);
    return finish();
  }

  console.log(`Updating aven ${version} -> ${wanted}`);
  const archive = await downloadVerified(wanted, platformName());
  await writePendingUpdate(marker, { from: version, to: wanted, binary: process.execPath });
  await installBinary(archive, process.execPath);
  const code = await run([process.execPath, "update", "--finish"]);
  if (code !== 0) {
    console.error(
      `The update to aven ${wanted} stopped before it finished, so the server and the runner may still be ${version}. Run: aven update`,
    );
    process.exit(code);
  }
}

export async function finish() {
  const server = await serverUpgrade(version);
  const runner = await runnerUpgrade(version);
  if (!server && !runner)
    console.log("Neither a server nor a runner is installed on this machine.");
  else await removeStaleImages(version);
  await clearPendingUpdate(pendingUpdateFile());
  console.log(
    `aven ${version} is installed${server ? ", the server is updated" : ""}${runner ? ", the runner is updated" : ""}.`,
  );
}
