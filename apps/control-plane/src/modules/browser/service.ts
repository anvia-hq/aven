import { UnavailableError } from "../../errors";
import { ENTER_PATH } from "./proxy";
import { signBrowserToken } from "./token";
import type { BrowserServiceOptions } from "./types";

export const TICKET_TTL_MS = 60 * 1000;

export function createBrowserService({ origin, secret, readable }: BrowserServiceOptions) {
  return {
    async open(organizationId: string, userId: string, threadId: string, port: number) {
      if (!origin) {
        throw new UnavailableError(
          "The Browser is not set up on this server: set AVEN_BROWSER_ORIGIN (docs/products/0007-system-reference.md)",
        );
      }
      await readable({ organizationId, userId }, threadId);
      const ticket = signBrowserToken(
        secret,
        "ticket",
        { organizationId, threadId, port },
        TICKET_TTL_MS,
      );
      return { url: `${origin}${ENTER_PATH}?ticket=${encodeURIComponent(ticket)}` };
    },
  };
}
