import { stringFlag } from "../args";
import { parseProxyPort, parseProxyRoutes, startPreviewProxyServer } from "../preview-proxy";
import type { Args } from "../types";

export async function proxyCommand(args: Args, log: (text: string) => void = console.log) {
  const port = parseProxyPort(stringFlag(args, "port"), "port");
  const webPort = parseProxyPort(stringFlag(args, "web"), "web");
  const apiRaw = stringFlag(args, "api");
  const apiPort = apiRaw ? parseProxyPort(apiRaw, "api") : undefined;
  const routes = parseProxyRoutes(stringFlag(args, "route"));
  const origin = stringFlag(args, "origin");
  const bind = stringFlag(args, "bind") ?? "127.0.0.1";

  const handle = startPreviewProxyServer({
    port,
    webPort,
    apiPort,
    routes,
    origin,
    bind,
  });

  const targets = [`web:${webPort}`];

  if (apiPort !== undefined) targets.push(`api:${apiPort}`);

  for (const route of routes) targets.push(`${route.prefix}=${route.port}`);

  log(`aven proxy listening on http://${bind}:${handle.port} (${targets.join(", ")})`);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      handle.stop();
      resolve();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}
