import { codexAccessToken } from "@aven/protocol/codex-login";

const KEPT = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "SSL_CERT_FILE",
  "CODEX_CA_CERTIFICATE",
  "SYSTEMROOT",
  "COMSPEC",
];

export function codexProcessEnv(
  base: Record<string, string | undefined>,
  home: string,
  login: string,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const name of KEPT) {
    const value = base[name];

    if (value) env[name] = value;
  }

  const token = codexAccessToken(login);

  if (!token) throw new Error("The ChatGPT login has no access token");

  env.CODEX_HOME = home;
  env.CODEX_ACCESS_TOKEN = token;
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  return env;
}

export function codexMcpCommand(socketPath: string) {
  const script = process.argv[1] ?? "";
  const flag = ["--codex-mcp-bridge", socketPath];

  if (script.endsWith(".ts") || script.endsWith(".js")) {
    return { command: process.execPath, args: [script, ...flag] };
  }

  return { command: process.execPath, args: flag };
}

export function codexConfig(
  instructions: string,
  command: { command: string; args: string[] },
  env: Record<string, string>,
) {
  return {
    cli_auth_credentials_store: "ephemeral",
    developer_instructions: instructions,
    features: { shell_tool: false, view_image: false },
    mcp_servers: {
      aven: {
        command: command.command,
        args: command.args,
        env: { PATH: env.PATH ?? "", HOME: env.HOME ?? "" },
      },
    },
  };
}

export function codexThreadOptions(model: string | undefined, cwd: string) {
  return {
    model,
    sandboxMode: "read-only" as const,
    workingDirectory: cwd,
    skipGitRepoCheck: true,
    approvalPolicy: "never" as const,
    webSearchMode: "disabled" as const,
  };
}
