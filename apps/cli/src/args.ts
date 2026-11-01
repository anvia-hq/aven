export type Args = {
  positionals: string[];
  /** `--name value` is a string, `--name` alone is true. */
  flags: Record<string, string | true>;
};

/** Splits `--flag`, `--flag value` and `--flag=value` from the rest. A flag only takes the next word as its value if it is listed in `valued`. */
export function parseArgs(argv: string[], valued: string[] = []): Args {
  const args: Args = { positionals: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]!;
    // `-f` is a flag like `--f`.
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

/** A flag's string value, or undefined when it is absent. A flag given without a value is an error. */
export function stringFlag(args: Args, name: string) {
  const value = args.flags[name];
  if (value === true) throw new Error(`--${name} needs a value`);
  return value;
}
