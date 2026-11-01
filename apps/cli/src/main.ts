import { parseArgs, type Args } from "./args";
import {
  serverInstall,
  serverLogs,
  serverStart,
  serverStatus,
  serverStop,
} from "./commands/server";
import { version } from "./version";

const usage = `aven ${version}

Usage: aven <command>

Server:
  server install [--port N] [--origin URL] [--release X]
              Install and start the server (Postgres, API and web) in ~/.aven/server
  start       Start the server
  stop        Stop it; the database is kept
  restart     Start again, applying changes to .env
  status      Show what runs and whether it answers
  logs [service] [--follow]

Other:
  version     Print the version
  help        Print this help
`;

const follows = (args: Args) => Boolean(args.flags.follow || args.flags.f);

async function main(argv: string[]) {
  const args = parseArgs(argv, ["port", "origin", "release"]);
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
