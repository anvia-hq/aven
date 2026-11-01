// Set when the binary is built (`--define AVEN_VERSION='"0.3.0"'`), which is what the release
// workflow does; a checkout run with `bun src/main.ts` is "dev".
declare const AVEN_VERSION: string | undefined;

export const version = typeof AVEN_VERSION === "string" ? AVEN_VERSION : "dev";
