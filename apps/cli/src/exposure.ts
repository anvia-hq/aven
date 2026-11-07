export type ExposureReport = { ok: boolean; detail: string };

type Env = Record<string, string | undefined>;

const isLoopback = (address: string) => address.startsWith("127.");

export const serveDomain = (env: Env) => {
  const address = env.AVEN_SITE_ADDRESS?.trim() ?? "";
  return address !== "" && !address.startsWith(":") ? address : undefined;
};

export function describeExposure(env: Env): ExposureReport {
  const bind = env.AVEN_BIND?.trim() ?? "";
  const domain = serveDomain(env);
  if (domain) {
    return bind !== "" && isLoopback(bind)
      ? {
          ok: false,
          detail: `${domain} is served over HTTPS but AVEN_BIND=${bind}: Caddy cannot get its certificate unless port ${env.AVEN_PORT ?? 80} is reachable. Set AVEN_BIND=0.0.0.0 and run: aven restart`,
        }
      : { ok: true, detail: `HTTPS for ${domain}` };
  }
  if (bind !== "" && isLoopback(bind))
    return { ok: true, detail: "reachable from this machine only" };
  const open = bind === "" || bind === "0.0.0.0" ? "every network this machine is on" : bind;
  return {
    ok: false,
    detail:
      `plain HTTP on port ${env.AVEN_PORT ?? "2836"} is open to ${open}: sign-ins are not encrypted on the way. ` +
      "For this machine only set AVEN_BIND=127.0.0.1 and run: aven restart. For a server, install with --domain, or put a VPN or an HTTPS proxy in front.",
  };
}

export function describeSignups(
  exposure: ExposureReport,
  env: Env,
  registrationEnabled: boolean,
): ExposureReport {
  if (!registrationEnabled) return { ok: true, detail: "closed: only owners and invited people" };
  const local = isLoopback(env.AVEN_BIND?.trim() ?? "x") && !serveDomain(env);
  if (local) return { ok: true, detail: "open, to this machine only" };
  return {
    ok: false,
    detail:
      "open to anyone who can reach the server" +
      (exposure.ok ? "" : ", which is open to a network") +
      ". Close them in Settings > Platform; the first account to register owns the server.",
  };
}
