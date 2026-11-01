import { stringFlag, type Args } from "../args";
import { run } from "../compose";
import { downloadVerified, installBinary, latestVersion, platformName } from "../release";
import { version } from "../version";
import { runnerUpgrade } from "./runner";
import { serverUpgrade } from "./server";

/**
 * Updates this machine: the `aven` binary first, then, with the new binary, whatever is installed
 * here (the server, the runner), because the compose file and the sandbox image of a release are
 * the ones that release's binary carries.
 */
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

async function finish() {
  const server = await serverUpgrade(version);
  const runner = await runnerUpgrade(version);
  if (!server && !runner)
    console.log("Neither a server nor a runner is installed on this machine.");
  console.log(
    `aven ${version} is installed${server ? ", the server is updated" : ""}${runner ? ", the runner is updated" : ""}.`,
  );
}
