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

const DEFAULT_API_PORT = 3030;

function portNumber(value: string | undefined, fallback: number, flag: string) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error(`--${flag} must be a port number`);
  return port;
}

/**
 * What a new server is installed with, from the flags: plain HTTP on port 3000, or, with a domain,
 * HTTPS on the standard ports (Caddy needs both for its certificate) at https://<domain>. Also the
 * ports that have to be free on this machine.
 */
export function planServer(input: ServerPlanInput) {
  const { domain } = input;
  if (domain !== undefined && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(domain))
    throw new Error("--domain must be a host name such as aven.example.com");

  const port = portNumber(input.port, domain ? 80 : 3000, "port");
  const httpsPort = portNumber(input.httpsPort, 443, "https-port");
  const apiPort = portNumber(input.apiPort, DEFAULT_API_PORT, "api-port");

  const options: ServerEnvOptions = {
    origin: input.origin ?? "",
    port,
    version: input.release,
    ownerEmail: input.ownerEmail,
    apiPort,
  };
  const needed = [port, apiPort];
  if (domain) {
    options.domain = domain;
    options.httpsPort = httpsPort;
    needed.push(httpsPort);
    options.origin ||= `https://${domain}${httpsPort === 443 ? "" : `:${httpsPort}`}`;
  } else options.origin ||= `http://localhost:${port}`;
  return { options, needed };
}
