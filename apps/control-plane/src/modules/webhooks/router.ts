import { Elysia, status } from "elysia";

import { WEBHOOK_BODY_MAX } from "@aven/protocol/webhooks";

import { NotFoundError, orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import { WEBHOOK_HEADERS } from "./note";
import {
  createWebhookBody,
  updateWebhookBody,
  webhookDeliveryParams,
  webhookParams,
} from "./schema";
import type { Webhooks } from "./types";

const TOKEN_HEADER = "x-aven-webhook-token";

const BEARER = /^Bearer\s+(\S+)$/i;

function tokenOf(request: Request) {
  const header = request.headers.get(TOKEN_HEADER)?.trim();

  if (header) return header;

  return BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
}

function headersOf(request: Request) {
  const found: Record<string, string> = {};
  for (const name of WEBHOOK_HEADERS) {
    const value = request.headers.get(name);

    if (value) found[name] = value;
  }
  return found;
}

export const webhooksRouter = (webhooks: Webhooks) => {
  const deliver = async (id: string, token: string | undefined, request: Request) => {
    const given = token ?? tokenOf(request);

    if (!given) {
      return status(401, `Send the webhook's token in the URL or as ${TOKEN_HEADER}`);
    }

    if (Number(request.headers.get("content-length") ?? 0) > WEBHOOK_BODY_MAX) {
      return status(413, "The webhook's body is too large");
    }

    const body = await request.text();

    if (body.length > WEBHOOK_BODY_MAX) return status(413, "The webhook's body is too large");

    await webhooks.receive(id, { token: given, body, headers: headersOf(request) });
    return status(202, { ok: true });
  };

  return new Elysia({ prefix: "/webhooks" })
    .use(authRouter)
    .get("/", ({ user }) => webhooks.list(user.id), { auth: true })
    .post("/", ({ body, user }) => webhooks.create(user.id, body), {
      auth: true,
      body: createWebhookBody,
    })
    .patch(
      "/:id",
      async ({ params, body, user }) =>
        orNotFound(
          await webhooks.setEnabled(user.id, params.id, body.enabled),
          "Webhook not found",
        ),
      { auth: true, params: webhookParams, body: updateWebhookBody },
    )
    .delete(
      "/:id",
      async ({ params, user }) => {
        if (!(await webhooks.remove(user.id, params.id))) {
          throw new NotFoundError("Webhook not found");
        }

        return { ok: true };
      },
      { auth: true, params: webhookParams },
    )
    .post("/:id", ({ params, request }) => deliver(params.id, undefined, request), {
      params: webhookParams,
      parse: "none",
    })
    .post("/:id/:token", ({ params, request }) => deliver(params.id, params.token, request), {
      params: webhookDeliveryParams,
      parse: "none",
    });
};
