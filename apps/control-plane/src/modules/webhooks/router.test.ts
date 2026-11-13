import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { WEBHOOK_BODY_MAX } from "@aven/protocol/webhooks";

import { errorsRouter, NotFoundError } from "@aven/server-kit/errors";
import { webhooksRouter } from "./router";
import type { Webhook } from "@aven/protocol/types";
import type { Webhooks } from "./types";

const id = "11111111-1111-4111-8111-111111111111";

const webhook: Webhook = {
  id,
  name: "Issues",
  hint: "abcd",
  path: `/webhooks/${id}`,
  enabled: true,
  lastDeliveryAt: null,
  lastStatus: null,
  createdAt: "2026-11-13T10:00:00.000Z",
};

function appOf(overrides: Partial<Webhooks> = {}) {
  const received: { id: string; token: string; body: string; headers: Record<string, string> }[] =
    [];
  const webhooks: Webhooks = {
    list: async () => [webhook],
    create: async () => ({ ...webhook, token: "avnwh_secret", urlPath: "/webhooks/x" }),
    setEnabled: async () => webhook,
    remove: async () => true,
    receive: async (webhookId, delivery) => {
      received.push({ id: webhookId, ...delivery });
      return { id: webhookId, status: "delivered" };
    },
    ...overrides,
  };
  const app = new Elysia().use(errorsRouter).use(webhooksRouter(webhooks));
  return { app, received };
}

const deliver = (path: string, init?: RequestInit) =>
  new Request(`http://localhost${path}`, { method: "POST", ...init });

describe("the webhook endpoint", () => {
  test("takes a delivery with the token in the path, its body and its event headers, and answers 202", async () => {
    const { app, received } = appOf();
    const response = await app.handle(
      deliver(`/webhooks/${id}/avnwh_secret`, {
        headers: { "content-type": "application/json", "x-github-event": "issues" },
        body: JSON.stringify({ action: "opened" }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      id,
      token: "avnwh_secret",
      body: '{"action":"opened"}',
      headers: { "x-github-event": "issues" },
    });
    expect(received[0]?.headers).not.toHaveProperty("authorization");
  });

  test("takes the token in x-aven-webhook-token or as a Bearer token instead", async () => {
    const { app, received } = appOf();
    const headersOf: Record<string, string>[] = [
      { "x-aven-webhook-token": "avnwh_header" },
      { authorization: "Bearer avnwh_bearer" },
    ];
    for (const headers of headersOf) {
      const response = await app.handle(deliver(`/webhooks/${id}`, { headers, body: "payload=1" }));
      expect(response.status).toBe(202);
    }
    expect(received.map((delivery) => delivery.token)).toEqual(["avnwh_header", "avnwh_bearer"]);
  });

  test("turns away a delivery with no token, an unknown webhook, or a body that is too large", async () => {
    const missing = appOf();
    expect((await missing.app.handle(deliver(`/webhooks/${id}`))).status).toBe(401);

    const unknown = appOf({
      receive: async () => {
        throw new NotFoundError("Webhook not found");
      },
    });
    const notFound = await unknown.app.handle(
      deliver(`/webhooks/${id}/avnwh_wrong`, { body: "{}" }),
    );
    expect(notFound.status).toBe(404);
    expect(await notFound.text()).toBe("Webhook not found");

    const tooBig = appOf();
    const large = await tooBig.app.handle(
      deliver(`/webhooks/${id}/avnwh_secret`, { body: "x".repeat(WEBHOOK_BODY_MAX + 1) }),
    );
    expect(large.status).toBe(413);
    expect(tooBig.received).toEqual([]);
  });

  test("keeps the person's own routes behind a session", async () => {
    const { app } = appOf();
    for (const [path, method, body] of [
      ["/webhooks", "GET", undefined],
      ["/webhooks", "POST", JSON.stringify({ name: "Issues" })],
      [`/webhooks/${id}`, "PATCH", JSON.stringify({ enabled: false })],
      [`/webhooks/${id}`, "DELETE", undefined],
    ] as const) {
      const response = await app.handle(
        new Request(`http://localhost${path}`, {
          method,
          headers: { "content-type": "application/json" },
          body,
        }),
      );
      expect(response.status).toBe(401);
    }
  });
});
