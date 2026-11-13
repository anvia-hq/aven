import { previewSettings } from "./config";
import { startPreviewProxy } from "./proxy";
import type { createPreviewService } from "./service";

export function startPreviews(service: ReturnType<typeof createPreviewService>) {
  const settings = previewSettings();
  const domain = settings.domain;

  if (!domain) {
    console.log(
      "Previews are off: set AVEN_PREVIEW_DOMAIN to serve a runner's ports on its own subdomains",
    );
    return undefined;
  }

  const proxy = startPreviewProxy({
    hostname: settings.hostname,
    port: settings.port,
    domain,
    secret: settings.secret,
    open: (claims, sink) => service.relay(claims, sink),
  });

  console.log(
    `Previews are served at https://<port>-<runner>.${domain}, listening on ${settings.hostname}:${proxy.port}`,
  );

  return { stop: () => proxy.stop() };
}
