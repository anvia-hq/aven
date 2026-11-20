import { Elysia } from "elysia";

import { NotFoundError } from "@aven/server-kit/errors";
import { authRouter } from "../auth/router";
import { cloudSettingsService } from "../cloud-settings/service";
import { requirePlatformOwner } from "../platform/owner";
import { cloudSandboxStore } from "./sandbox-store";
import { saveCloudLifecycleBody } from "./schema";
import { cloudLifecycleService } from "./service";
import { spendBrakeService } from "./spend";
import type { CloudLifecycleStatus } from "./types";

const MICROS_PER_CENT = 10_000;

export const cloudLifecycleRouter = new Elysia({ prefix: "/platform/cloud/lifecycle" })
  .use(authRouter)
  .get(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      return cloudLifecycleService.current();
    },
    { auth: true },
  )
  .get(
    "/status",
    async ({ user }): Promise<CloudLifecycleStatus> => {
      await requirePlatformOwner(user);
      const [spend, draining, failedDeletes] = await Promise.all([
        spendBrakeService.verdict(),
        cloudSettingsService.drainingConfigs(),
        cloudSandboxStore.failedDeletes(),
      ]);
      return {
        spend: {
          state: spend.state,
          usedCents: Math.round(spend.usedMicros / MICROS_PER_CENT),
          budgetCents:
            spend.budgetMicros === null ? null : Math.round(spend.budgetMicros / MICROS_PER_CENT),
          percent: Math.round(spend.percent * 10) / 10,
        },
        drainingProviders: draining.length,
        failedDeletes,
      };
    },
    { auth: true },
  )
  .put(
    "/",
    async ({ body, user }) => {
      await requirePlatformOwner(user);
      const saved = await cloudLifecycleService.save(body);
      spendBrakeService.invalidate();
      return saved;
    },
    { auth: true, body: saveCloudLifecycleBody },
  )
  .delete(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      const reset = await cloudLifecycleService.reset();
      spendBrakeService.invalidate();
      return reset;
    },
    { auth: true },
  )
  .post(
    "/failed/:runtimeId/retry",
    async ({ params, user }) => {
      await requirePlatformOwner(user);
      const retried = await cloudSandboxStore.retryDelete(params.runtimeId);

      if (!retried) throw new NotFoundError("No failed cloud sandbox delete found for that id");

      return { ok: true };
    },
    { auth: true },
  );
