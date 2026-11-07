import type { Args } from "./types";

export function parseArgs(argv: string[], valued: string[] = []): Args {
  const args: Args = { positionals: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]!;
    if (/^-[A-Za-z]$/.test(word)) {
      args.flags[word.slice(1)] = true;
      continue;
    }
    if (!word.startsWith("--")) {
      args.positionals.push(word);
      continue;
    }
    const [name, inline] = word.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    if (inline !== undefined) args.flags[name] = inline;
    else if (valued.includes(name)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`--${name} needs a value`);
      args.flags[name] = value;
    } else args.flags[name] = true;
  }
  return args;
}

export function stringFlag(args: Args, name: string) {
  const value = args.flags[name];
  if (value === true) throw new Error(`--${name} needs a value`);
  return value;
}
