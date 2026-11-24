import { AUTOMATION_BODY_MAX } from "@aven/protocol/automations";
import { NotFoundError, orNotFound } from "@aven/server-kit/errors";
import { bearerToken } from "@aven/server-kit/tokens";
import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { WEBHOOK_HEADERS } from "../webhooks/note";
import {
  automationHookParams,
  automationParams,
  createAutomationBody,
  updateAutomationBody,
} from "./schema";
import type { Automations } from "./types";

const TOKEN_HEADER = "x-aven-automation-token";

function tokenOf(request: Request) {
  const header = request.headers.get(TOKEN_HEADER)?.trim();

  if (header) return header;

  return bearerToken(request.headers.get("authorization"));
}

function headersOf(request: Request) {
  const found: Record<string, string> = {};
  for (const name of WEBHOOK_HEADERS) {
    const value = request.headers.get(name);

    if (value) found[name] = value;
  }
  return found;
}

export const automationsRouter = (automations: Automations) => {
  const deliver = async (id: string, token: string | undefined, request: Request) => {
    const given = token ?? tokenOf(request);

    if (!given) {
      return status(401, `Send the automation token in the URL or as ${TOKEN_HEADER}`);
    }

    if (Number(request.headers.get("content-length") ?? 0) > AUTOMATION_BODY_MAX) {
      return status(413, "The payload is too large");
    }

    const body = await request.text();

    if (body.length > AUTOMATION_BODY_MAX) return status(413, "The payload is too large");

    const run = await automations.receiveWebhook(id, {
      token: given,
      body,
      headers: headersOf(request),
    });
    return status(run.status === "failed" ? 503 : 202, run);
  };

  return new Elysia({ prefix: "/automations" })
    .use(authRouter)
    .get("/", ({ organizationId, user }) => automations.list({ organizationId, userId: user.id }), {
      auth: true,
      org: true,
    })
    .post(
      "/",
      ({ body, organizationId, user }) =>
        automations.create({ organizationId, userId: user.id }, body),
      { auth: true, org: true, body: createAutomationBody },
    )
    .patch(
      "/:id",
      async ({ params, body, organizationId, user }) =>
        orNotFound(
          await automations.update({ organizationId, userId: user.id }, params.id, body),
          "Automation not found",
        ),
      { auth: true, org: true, params: automationParams, body: updateAutomationBody },
    )
    .delete(
      "/:id",
      async ({ params, organizationId, user }) => {
        if (!(await automations.remove({ organizationId, userId: user.id }, params.id))) {
          throw new NotFoundError("Automation not found");
        }

        return { ok: true };
      },
      { auth: true, org: true, params: automationParams },
    )
    .get(
      "/:id/runs",
      ({ params, organizationId, user }) =>
        automations.runs({ organizationId, userId: user.id }, params.id),
      { auth: true, org: true, params: automationParams },
    )
    .post(
      "/:id/trigger",
      async ({ params, organizationId, user }) =>
        status(
          202,
          await automations.triggerManual({ organizationId, userId: user.id }, params.id),
        ),
      { auth: true, org: true, params: automationParams },
    )
    .post("/hooks/:id", ({ params, request }) => deliver(params.id, undefined, request), {
      params: automationParams,
      parse: "none",
    })
    .post("/hooks/:id/:token", ({ params, request }) => deliver(params.id, params.token, request), {
      params: automationHookParams,
      parse: "none",
    });
};
