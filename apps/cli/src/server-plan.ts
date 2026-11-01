import type { ServerEnvOptions } from "./env-file";

export type ServerPlanInput = {
  port?: string;
  httpsPort?: string;
  apiPort?: string;
  domain?: string;
  origin?: string;
  release: string;
  ownerEmail?: string;
};

// Where a new install listens by default: not the ports other development servers already use
// (3000, 8000, 5173...). 2836 spells AVEN on a phone keypad. When one is taken the next free port
// of the range is used, and the install says so.
export const WEB_PORT = 2836;
export const API_PORT = 2837;
export const HTTPS_PORT = 2838;
const LAST_PORT = 2899;

function portNumber(value: string | undefined, fallback: number, flag: string) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error(`--${flag} must be a port number`);
  return port;
}

/**
 * The first port from `from` that is free and not already chosen, within the default range. The
 * other ports' defaults are left to them, so a busy 2836 does not push the API off 2837.
 */
function firstFree(from: number, chosen: number[], isFree: (port: number) => boolean) {
  const others = [WEB_PORT, API_PORT, HTTPS_PORT].filter((port) => port !== from);
  for (let port = from; port <= LAST_PORT; port++)
    if (!chosen.includes(port) && !others.includes(port) && isFree(port)) return port;
  throw new Error(
    `No free port between ${from} and ${LAST_PORT}. Pick one with --port, --https-port or --api-port.`,
  );
}

/**
 * What a new server is installed with, from the flags: plain HTTP on port 2836, or, with a domain,
 * HTTPS on the standard ports (Caddy needs both for its certificate) at https://<domain>. A port
 * the flags do not name is the default or, when something listens there, the next free one of the
 * range (`notes` says which moved). Also the ports that have to be free on this machine.
 */
export function planServer(input: ServerPlanInput, isFree: (port: number) => boolean = () => true) {
  const { domain } = input;
  if (domain !== undefined && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(domain))
    throw new Error("--domain must be a host name such as aven.example.com");

  const chosen: number[] = [];
  const notes: string[] = [];
  // A port named by a flag is used as it is (and has to be free); one that is not is looked for.
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
  };
  const needed = [port, apiPort, httpsPort];
  if (domain) {
    options.domain = domain;
    options.origin ||= `https://${domain}${httpsPort === 443 ? "" : `:${httpsPort}`}`;
  } else options.origin ||= `http://localhost:${port}`;
  return { options, needed, notes };
}
