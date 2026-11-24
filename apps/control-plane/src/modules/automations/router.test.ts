import { describe, expect, test } from "bun:test";

import { AUTOMATION_BODY_MAX } from "@aven/protocol/automations";
import type { AutomationRun } from "@aven/protocol/types";
import { Elysia } from "elysia";

import { automationsRouter } from "./router";
import type { AutomationDelivery, Automations } from "./types";

function makeRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: crypto.randomUUID(),
    automationId: crypto.randomUUID(),
    threadId: crypto.randomUUID(),
    triggerSummary: "Incoming webhook payload",
    status: "running",
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    ...overrides,
  };
}

function fakeAutomations(
  receive: (id: string, delivery: AutomationDelivery) => Promise<AutomationRun>,
): Automations {
  const unexpected = async () => {
    throw new Error("not expected");
  };
  return {
    list: unexpected,
    create: unexpected,
    update: unexpected,
    remove: unexpected,
    runs: unexpected,
    triggerManual: unexpected,
    receiveWebhook: receive,
    fireScheduled: unexpected,
    recordThreadEnded: unexpected,
  };
}

describe("automationsRouter webhook intake", () => {
  const id = crypto.randomUUID();

  test("rejects missing token with 401 and oversized payloads with 413", async () => {
    const app = new Elysia().use(
      automationsRouter(fakeAutomations(async () => makeRun({ automationId: id }))),
    );

    const unauth = await app.handle(
      new Request(`http://test/automations/hooks/${id}`, { method: "POST", body: "{}" }),
    );
    expect(unauth.status).toBe(401);

    const tooBig = await app.handle(
      new Request(`http://test/automations/hooks/${id}/avnau_secret`, {
        method: "POST",
        body: "x".repeat(AUTOMATION_BODY_MAX + 1),
      }),
    );
    expect(tooBig.status).toBe(413);
  });

  test("extracts event headers, returns 202 when started, and 503 when start fails", async () => {
    const seen: AutomationDelivery[] = [];
    const okApp = new Elysia().use(
      automationsRouter(
        fakeAutomations(async (_id, delivery) => {
          seen.push(delivery);
          return makeRun({ automationId: id, status: "running" });
        }),
      ),
    );

    const ok = await okApp.handle(
      new Request(`http://test/automations/hooks/${id}`, {
        method: "POST",
        headers: {
          "x-aven-automation-token": "avnau_tok",
          "x-event-type": "crash.reported",
          "x-sentry-event": "issue.created",
          "x-ignored-header": "nope",
        },
        body: '{"title":"PDF export crash"}',
      }),
    );
    expect(ok.status).toBe(202);
    expect(seen[0]?.token).toBe("avnau_tok");
    expect(seen[0]?.headers).toEqual({
      "x-event-type": "crash.reported",
      "x-sentry-event": "issue.created",
    });

    const failedApp = new Elysia().use(
      automationsRouter(
        fakeAutomations(async () =>
          makeRun({ automationId: id, status: "failed", threadId: null, error: "Runner offline" }),
        ),
      ),
    );
    const failed = await failedApp.handle(
      new Request(`http://test/automations/hooks/${id}/avnau_tok`, {
        method: "POST",
        body: "{}",
      }),
    );
    expect(failed.status).toBe(503);
  });
});
