import { section } from "./instruction";

/**
 * What the agent is told of the project's environment variables: their names, never their values
 * (decision 0045). The commands it runs have them in their environment; nothing here, and nothing
 * the model is sent, holds a value. Empty without any.
 */
export function environmentInstructions(names: readonly string[]) {
  if (names.length === 0) return "";
  const body = [
    "The project has environment variables set for you: every command you run and every process you start has them in its environment, so use them by name, for example $DATABASE_URL, and do not copy their values into files, commits or messages. Some may be secrets.",
    `Variables: ${names.join(", ")}`,
  ].join("\n");
  return section("environment_variables", body);
}
