import { createTool } from "@anvia/core";
import { OPEN_BROWSER_TOOL_NAME } from "@aven/protocol/events";
import { normalizePreviewPath, PREVIEW_MAX_PATH_LENGTH } from "@aven/protocol/preview";
import { z } from "zod";

export const openBrowserSchema = z.object({
  port: z
    .int()
    .min(1)
    .max(65535)
    .describe("The port a web server on this machine listens on, such as 3000."),
  path: z
    .string()
    .max(PREVIEW_MAX_PATH_LENGTH)
    .optional()
    .describe("Optional path to open on that port, such as /login or /dashboard. Defaults to /."),
});

export type OpenBrowserInput = z.infer<typeof openBrowserSchema>;

export function createOpenBrowserTool() {
  return createTool({
    name: OPEN_BROWSER_TOOL_NAME,
    description:
      "Offer to open a page you are serving, such as a dev server you started, in the thread's Browser panel so the user can see it through Aven's per-port preview tunnel. The user sees an Open button for that port and confirms it before anything is exposed: you cannot open the panel yourself and do not see the page. Start the server and use wait_for_port first, then call this once for the user-facing web port only (never for a separate backend API port; route API calls through the same origin on the frontend port) and say what the user will see.",
    inputSchema: openBrowserSchema,
    async handler({ port, path }) {
      const normalized = normalizePreviewPath(path);
      const suffix = normalized === "/" ? "" : normalized;
      return `Offered http://localhost:${port}${suffix} to the user. They decide whether to open it; do not assume it is open.`;
    },
  });
}
