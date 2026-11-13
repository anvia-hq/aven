import { PREVIEW_ENTER_PATH, previewPortRefusal } from "@aven/protocol/preview";

import { ForbiddenError, UnavailableError, UnprocessableError } from "../../errors";
import { LOCAL_RUNTIME_ID } from "../runtimes/local-id";
import { previewHostname } from "./host";
import { signPreviewToken } from "./token";
import type { PreviewClaims, PreviewServiceOptions } from "./types";
import type { ViewerHandle, ViewerSink } from "../runtimes/types";

export const TICKET_TTL_MS = 60 * 1000;

const NOT_SET_UP =
  "Previews are not set up on this server: set AVEN_PREVIEW_DOMAIN to the domain their hosts live under (docs/products/0007-system-reference.md)";

function controlPlaneOwnPorts(env: Record<string, string | undefined>) {
  return [
    { port: Number(env.PORT ?? 8000), name: "the control plane" },
    { port: Number(env.AVEN_API_PORT ?? 2837), name: "the control plane's API" },
    { port: Number(env.AVEN_PREVIEW_PORT ?? 8001), name: "the preview listener" },
  ];
}

export function previewRefusal(
  port: number,
  runtimeId: string,
  env: Record<string, string | undefined> = process.env,
) {
  const refused = previewPortRefusal(port);

  if (refused) return refused;

  if (runtimeId !== LOCAL_RUNTIME_ID) return undefined;

  const own = controlPlaneOwnPorts(env).find((service) => service.port === port);

  return own
    ? `Port ${port} is ${own.name}'s own on this machine, so it is not a preview`
    : undefined;
}

export function previewUrl(domain: string, claims: PreviewClaims, ticket: string, embed: boolean) {
  const host = previewHostname(claims, domain);
  const mode = embed ? "&embed=1" : "";
  return `https://${host}${PREVIEW_ENTER_PATH}?ticket=${encodeURIComponent(ticket)}${mode}`;
}

export function createPreviewService({
  settings,
  usable,
  online,
  openPort,
  env = process.env,
}: PreviewServiceOptions) {
  const link = (claims: PreviewClaims, embed: boolean) =>
    previewUrl(
      settings.domain!,
      claims,
      signPreviewToken(settings.secret, "ticket", claims, TICKET_TTL_MS),
      embed,
    );

  return {
    async open(organizationId: string, userId: string, runtimeId: string, port: number) {
      const domain = settings.domain;

      if (!domain) throw new UnavailableError(NOT_SET_UP);

      const refused = previewRefusal(port, runtimeId, env);

      if (refused) throw new UnprocessableError(refused);

      if (!(await usable(organizationId, userId, runtimeId)))
        throw new ForbiddenError("That runner is not one you can use");

      if (!online(runtimeId))
        throw new UnavailableError("That runner is offline, so its port cannot be opened");

      const claims = { runtimeId, port };
      return { url: link(claims, false), embedUrl: link(claims, true) };
    },

    async relay(claims: PreviewClaims, sink: ViewerSink): Promise<ViewerHandle> {
      const refused = previewRefusal(claims.port, claims.runtimeId, env);

      if (refused) throw new UnprocessableError(refused);

      return openPort(claims.runtimeId, claims.port, sink);
    },
  };
}
