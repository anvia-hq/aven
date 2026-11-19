import { createTool } from "@anvia/core";
import { OPEN_BROWSER_TOOL_NAME } from "@aven/protocol/events";
import { z } from "zod";

export const openBrowserSchema = z.object({
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .describe("The port a web server on this machine listens on, such as 3000."),
});

export type OpenBrowserInput = z.infer<typeof openBrowserSchema>;

export function createOpenBrowserTool() {
  return createTool({
    name: OPEN_BROWSER_TOOL_NAME,
    description:
      "Offer to open a page you are serving, such as a dev server you started, in the thread's Browser panel so the user can see it. The user sees an Open button for http://localhost:<port> and confirms it before anything is exposed: you cannot open the panel yourself and do not see the page. Start the server and use wait_for_port first, then call this once and say what the user will see.",
    inputSchema: openBrowserSchema,
    async handler({ port }) {
      return {
        offered: true,
        address: `http://localhost:${port}`,
        note: "The user was offered the page and decides whether to open it. Do not assume it is open.",
      };
    },
  });
}
