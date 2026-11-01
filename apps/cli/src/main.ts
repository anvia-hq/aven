import { parseArgs, type Args } from "./args";
import {
  serverInstall,
  serverLogs,
  serverStart,
  serverStatus,
  serverStop,
} from "./commands/server";
import {
  runnerInstall,
  runnerLogs,
  runnerRestart,
  runnerRun,
  runnerStart,
  runnerStatus,
  runnerStop,
  runnerUninstall,
} from "./commands/runner";
import { doctor } from "./commands/doctor";
import { install } from "./commands/install";
import { update } from "./commands/update";
import { version } from "./version";

const usage = `aven ${version}

Usage: aven <command>

Everything:
  install [--port N] [--origin URL] [--owner-email E] [--no-runner] [--no-open]
              Install the server and a runner on this machine and open it
  install --runner --url <address> --token <token>
              Install only a runner, for a server somewhere else
  doctor      Check Docker, git, the server and the runner

Server:
  server install [--port N] [--origin URL] [--release X]
              Install and start the server (Postgres, API and web) in ~/.aven/server
  start       Start the server
  stop        Stop it; the database is kept
  restart     Start again, applying changes to .env
  status      Show what runs and whether it answers
  logs [service] [--follow]

Runner (this machine hosts sandboxes for a server):
  runner install --url <address> --token <token> [--image X]
              Install this machine as a runner and start it as a service
  runner start | stop | restart | status | uninstall
  runner logs [--follow]
  runner run  Run in the foreground (what the service runs)

Other:
  update [--release X]
              Update aven, the server and the runner on this machine
  version     Print the version
  help        Print this help
`;

const follows = (args: Args) => Boolean(args.flags.follow || args.flags.f);

async function main(argv: string[]) {
  const args = parseArgs(argv, [
    "port",
    "origin",
    "release",
    "url",
    "token",
    "image",
    "owner-email",
  ]);
  const [command, sub] = args.positionals;

  switch (command) {
    case "version":
    case "--version":
      console.log(version);
      return;
    case undefined:
    case "help":
      console.log(usage);
      return;
    case "server":
      if (sub === "install") return serverInstall(args);
      if (sub === undefined || sub === "start" || sub === "restart") return serverStart();
      if (sub === "stop") return serverStop();
      if (sub === "status") return serverStatus();
      if (sub === "logs") return serverLogs(args.positionals[2], follows(args));
      throw new Error(`Unknown command "server ${sub}".\n\n${usage}`);
    case "runner":
      if (sub === "install") return runnerInstall(args);
      if (sub === "run") return runnerRun();
      if (sub === "start") return runnerStart();
      if (sub === "stop") return runnerStop();
      if (sub === "restart") return runnerRestart();
      if (sub === "status" || sub === undefined) return runnerStatus();
      if (sub === "logs") return runnerLogs(follows(args));
      if (sub === "uninstall") return runnerUninstall();
      throw new Error(`Unknown command "runner ${sub}".\n\n${usage}`);
    case "install":
      return install(args);
    case "doctor":
      return doctor();
    case "update":
      return update(args);
    case "start":
    case "restart":
      return serverStart();
    case "stop":
      return serverStop();
    case "status":
      return serverStatus();
    case "logs":
      return serverLogs(sub, follows(args));
    default:
      throw new Error(`Unknown command "${command}".\n\n${usage}`);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
