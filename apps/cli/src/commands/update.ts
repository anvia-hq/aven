import { stringFlag, type Args } from "../args";
import { run } from "../compose";
import { downloadVerified, installBinary, latestVersion, platformName } from "../release";
import { removeStaleImages } from "../prune-images";
import { version } from "../version";
import { runnerUpgrade } from "./runner";
import { serverUpgrade } from "./server";

export async function update(args: Args) {
  if (args.flags.finish) return finish();
  if (version === "dev")
    throw new Error("This is a development build of aven and cannot update itself.");

  const wanted = stringFlag(args, "release")?.replace(/^v/, "") ?? (await latestVersion());
  if (wanted === version && !args.flags.force) {
    console.log(`aven ${version} is up to date.`);
    return;
  }
  console.log(`Updating aven ${version} -> ${wanted}`);
  const archive = await downloadVerified(wanted, platformName());
  await installBinary(archive, process.execPath);
  const code = await run([process.execPath, "update", "--finish"]);
  if (code !== 0) process.exit(code);
}

export async function finish() {
  const server = await serverUpgrade(version);
  const runner = await runnerUpgrade(version);
  if (!server && !runner)
    console.log("Neither a server nor a runner is installed on this machine.");
  else await removeStaleImages(version);
  console.log(
    `aven ${version} is installed${server ? ", the server is updated" : ""}${runner ? ", the runner is updated" : ""}.`,
  );
}
