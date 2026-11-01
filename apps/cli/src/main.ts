import { version } from "./version";

const usage = `aven ${version}

Usage: aven <command>

Commands:
  version     Print the version
  help        Print this help
`;

const [command] = process.argv.slice(2);

switch (command) {
  case "version":
  case "--version":
    console.log(version);
    break;
  case undefined:
  case "help":
  case "--help":
  case "-h":
    console.log(usage);
    break;
  default:
    console.error(`Unknown command "${command}".\n\n${usage}`);
    process.exit(1);
}
