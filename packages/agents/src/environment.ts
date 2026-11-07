export function environmentInstructions(names: readonly string[]) {
  if (names.length === 0) return "";
  return [
    "<environment_variables>",
    "The project has environment variables set for you: every command you run and every process you start has them in its environment, so use them by name, for example $DATABASE_URL, and do not copy their values into files, commits or messages. Some may be secrets.",
    `Variables: ${names.join(", ")}`,
    "</environment_variables>",
  ].join("\n");
}
