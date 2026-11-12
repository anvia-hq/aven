import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type ServiceNames = { launchdLabel: string; systemdUnit: string };

type ServiceState = { file: string; program: string | undefined; problem: string | undefined };

export function serviceFile(
  platform: NodeJS.Platform,
  names: ServiceNames,
  home = homedir(),
): string | undefined {
  if (platform === "darwin")
    return join(home, "Library", "LaunchAgents", `${names.launchdLabel}.plist`);

  if (platform === "linux")
    return join(home, ".config", "systemd", "user", `${names.systemdUnit}.service`);

  return undefined;
}

export function serviceProgram(platform: NodeJS.Platform, text: string): string | undefined {
  if (platform === "darwin") return launchdProgram(text);

  if (platform === "linux") return systemdProgram(text);

  return undefined;
}

export function serviceProblem(options: {
  file: string;
  program: string | undefined;
  execPath: string;
  present: boolean;
}): string | undefined {
  const { file, program, execPath, present } = options;

  if (program === undefined) return `${file} does not say what it runs`;

  if (!present)
    return `${file} runs ${program}, which is not on this machine; this aven is ${execPath}`;

  if (program !== execPath) return `${file} runs ${program}, not this aven at ${execPath}`;

  return undefined;
}

export async function serviceUnitState(options: {
  platform: NodeJS.Platform;
  names: ServiceNames;
  execPath: string;
  home?: string;
}): Promise<ServiceState | undefined> {
  const file = serviceFile(options.platform, options.names, options.home);

  if (file === undefined) return undefined;

  const text = await readFile(file, "utf8").catch(() => undefined);

  if (text === undefined) return undefined;

  const program = serviceProgram(options.platform, text);
  const present = program !== undefined && (await isFile(program));
  return {
    file,
    program,
    problem: serviceProblem({ file, program, execPath: options.execPath, present }),
  };
}

async function isFile(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

function launchdProgram(text: string): string | undefined {
  const array = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(text)?.[1];

  if (array === undefined) return undefined;

  const first = /<string>([\s\S]*?)<\/string>/.exec(array)?.[1];
  return first === undefined ? undefined : unescapeXml(first);
}

function systemdProgram(text: string): string | undefined {
  const line = /^ExecStart=(.*)$/m.exec(text)?.[1];

  if (line === undefined) return undefined;

  const word = /^\s*"((?:[^"\\]|\\.)*)"/.exec(line)?.[1];
  return word === undefined ? undefined : unescapeSystemd(word);
}

const unescapeXml = (text: string) =>
  text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

function unescapeSystemd(text: string) {
  let out = "";
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!;

    if (char === "\\") {
      out += text[at + 1] ?? "";
      at++;
      continue;
    }

    if (char === "%" && text[at + 1] === "%") {
      out += "%";
      at++;
      continue;
    }

    out += char;
  }
  return out;
}
