import { isIPv4 } from "node:net";
import type { ServerEnvOptions, ServerPlanInput } from "./types";

export const WEB_PORT = 2836;
export const API_PORT = 2837;
export const HTTPS_PORT = 2838;
const LAST_PORT = 2899;

export function isExposed(input: Pick<ServerPlanInput, "domain" | "bind">) {
  return input.domain !== undefined || (input.bind !== undefined && !input.bind.startsWith("127."));
}

function portNumber(value: string | undefined, fallback: number, flag: string) {
  const port = value === undefined ? fallback : Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error(`--${flag} must be a port number`);

  return port;
}

function firstFree(from: number, chosen: number[], isFree: (port: number) => boolean) {
  const others = [WEB_PORT, API_PORT, HTTPS_PORT].filter((port) => port !== from);
  for (let port = from; port <= LAST_PORT; port++)
    if (!chosen.includes(port) && !others.includes(port) && isFree(port)) return port;
  throw new Error(
    `No free port between ${from} and ${LAST_PORT}. Pick one with --port, --https-port or --api-port.`,
  );
}

export function planServer(input: ServerPlanInput, isFree: (port: number) => boolean = () => true) {
  const { domain } = input;

  if (domain !== undefined && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(domain))
    throw new Error("--domain must be a host name such as aven.example.com");

  if (input.bind !== undefined && !isIPv4(input.bind))
    throw new Error("--bind must be an IPv4 address, such as 127.0.0.1 or 0.0.0.0");

  const bind = input.bind ?? (domain ? "0.0.0.0" : "127.0.0.1");
  const exposed = isExposed({ domain, bind });

  if (exposed && !input.ownerEmail?.trim())
    throw new Error(
      "A server that other machines can reach starts with sign-ups closed, and needs its owner: add --owner-email you@example.com",
    );

  const chosen: number[] = [];
  const notes: string[] = [];

  if (exposed)
    notes.push(
      `Sign-ups start closed: only ${input.ownerEmail?.trim()} can make the first account. Invite people from Settings > Members; Settings > Platform opens sign-ups.`,
    );

  if (!domain && !bind.startsWith("127."))
    notes.push(
      `Plain HTTP will be open to ${bind === "0.0.0.0" ? "every network this machine is on" : bind}: ` +
        "sign-ins are not encrypted on the way. Use --domain for HTTPS, or a VPN or a proxy that serves HTTPS.",
    );

  const choose = (value: string | undefined, fallback: number, flag: string, search: boolean) => {
    const port =
      value === undefined && search
        ? firstFree(fallback, chosen, isFree)
        : portNumber(value, fallback, flag);

    if (value === undefined && search && port !== fallback)
      notes.push(`Port ${fallback} is in use, so --${flag} ${port} is used instead.`);

    chosen.push(port);
    return port;
  };
  const port = choose(input.port, domain ? 80 : WEB_PORT, "port", !domain);
  const httpsPort = choose(input.httpsPort, domain ? 443 : HTTPS_PORT, "https-port", !domain);
  const apiPort = choose(input.apiPort, API_PORT, "api-port", true);

  const options: ServerEnvOptions = {
    origin: input.origin ?? "",
    port,
    version: input.release,
    ownerEmail: input.ownerEmail,
    apiPort,
    httpsPort,
    bind,
    registration: exposed ? "closed" : "open",
  };
  const needed = [port, apiPort, httpsPort];

  if (domain) {
    options.domain = domain;
    options.origin ||= `https://${domain}${httpsPort === 443 ? "" : `:${httpsPort}`}`;
  } else options.origin ||= `http://localhost:${port}`;

  return { options, needed, notes };
}
