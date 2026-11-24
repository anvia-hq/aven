import { db } from "@aven/db/client";
import { automationRuns } from "@aven/db/schema/automation-runs";
import { automations } from "@aven/db/schema/automations";
import { members } from "@aven/db/schema/members";
import { projects } from "@aven/db/schema/projects";
import type { AutomationRow, AutomationRunRow } from "@aven/db/schema/types";
import {
  AUTOMATION_MAX_CONCURRENT_RUNS,
  AUTOMATION_MIN_INTERVAL_MS,
  AUTOMATION_RUNS_LIMIT,
  AUTOMATION_TOKEN_PREFIX,
  AUTOMATIONS_LIMIT,
} from "@aven/protocol/automations";
import type {
  Automation,
  AutomationCreated,
  AutomationRun,
  AutomationStatus,
} from "@aven/protocol/types";
import { checkTimezone, CronError, minimumGapMinutes, nextRun } from "@aven/server-kit/cron";
import {
  ConflictError,
  describeError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from "@aven/server-kit/errors";
import { issueOpaqueToken, verifyOpaqueTokenHash } from "@aven/server-kit/tokens";
import { and, count, desc, eq, sql } from "drizzle-orm";

import { preferencesService } from "../preferences/service";
import { projectsService } from "../projects/service";
import { runtimesService } from "../runtimes/service";
import { buildAutomationPrompt, summarizeWebhookPayload } from "./prompt";
import type { CreateAutomationBody, UpdateAutomationBody } from "./schema";
import type { AutomationDelivery, AutomationRunner, Automations, AutomationViewer } from "./types";

async function defaultIsMember(organizationId: string, userId: string) {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)));
  return row !== undefined;
}

function checkCron(cron: string, timezone: string, now: Date) {
  try {
    checkTimezone(timezone);

    if (!nextRun(cron, timezone, now)) throw new UnprocessableError("That schedule never runs.");

    if (minimumGapMinutes(cron) * 60_000 < AUTOMATION_MIN_INTERVAL_MS) {
      throw new UnprocessableError("Schedules can run at most once every 15 minutes.");
    }
  } catch (error) {
    if (error instanceof CronError) throw new UnprocessableError(error.message);

    throw error;
  }
}

function viewAutomation(row: AutomationRow, projectName: string): Automation {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName,
    runtimeId: row.runtimeId,
    name: row.name,
    triggerKind: row.triggerKind,
    cron: row.cron,
    timezone: row.timezone,
    webhookPath: row.triggerKind === "webhook" ? `/automations/hooks/${row.id}` : null,
    webhookHint: row.webhookTokenHint,
    prompt: row.prompt,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastStatus: row.lastStatus,
    lastThreadId: row.lastThreadId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function viewRun(row: AutomationRunRow): AutomationRun {
  return {
    id: row.id,
    automationId: row.automationId,
    threadId: row.threadId,
    triggerSummary: row.triggerSummary,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

const ownedWhere = ({ organizationId, userId }: AutomationViewer, id: string) =>
  and(
    eq(automations.organizationId, organizationId),
    eq(automations.userId, userId),
    eq(automations.id, id),
  );

export function createAutomations({
  runner,
  isMember = defaultIsMember,
  maxConcurrentRuns = AUTOMATION_MAX_CONCURRENT_RUNS,
}: {
  runner: AutomationRunner;
  isMember?: (organizationId: string, userId: string) => Promise<boolean>;
  maxConcurrentRuns?: number;
}): Automations {
  async function disableRevoked(row: AutomationRow, now: Date) {
    await db
      .update(automations)
      .set({ enabled: false, nextRunAt: null, lastRunAt: now, lastStatus: "failed" })
      .where(eq(automations.id, row.id));
  }

  async function execute(
    row: AutomationRow,
    triggerSummary: string,
    payload?: string,
    now = new Date(),
  ): Promise<AutomationRun> {
    const title = `${row.name}: ${triggerSummary}`.slice(0, 120);
    const prompt = buildAutomationPrompt({
      name: row.name,
      triggerKind: row.triggerKind,
      triggerSummary,
      instructions: row.prompt,
      payload,
    });
    const runRow = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`automation-run:${row.id}`}))`);
      const [active] = await tx
        .select({ total: count() })
        .from(automationRuns)
        .where(and(eq(automationRuns.automationId, row.id), eq(automationRuns.status, "running")));

      if ((active?.total ?? 0) >= maxConcurrentRuns) {
        throw new ConflictError("This automation already has too many runs in progress");
      }

      const [made] = await tx
        .insert(automationRuns)
        .values({
          automationId: row.id,
          triggerSummary,
          status: "running",
        })
        .returning();
      return made!;
    });

    let createdThread: { threadId: string; runtimeId: string } | undefined;

    try {
      createdThread = await runner.createThread({
        organizationId: row.organizationId,
        userId: row.userId,
        projectId: row.projectId,
        runtimeId: row.runtimeId,
        title,
      });
      const [linked] = await db
        .update(automationRuns)
        .set({ threadId: createdThread.threadId })
        .where(eq(automationRuns.id, runRow.id))
        .returning();
      await db
        .update(automations)
        .set({ lastRunAt: now, lastStatus: "running", lastThreadId: createdThread.threadId })
        .where(eq(automations.id, row.id));
      await runner.startRun({
        organizationId: row.organizationId,
        userId: row.userId,
        threadId: createdThread.threadId,
        prompt,
      });
      return viewRun(linked!);
    } catch (error) {
      if (createdThread && runner.abandonThread) {
        await runner
          .abandonThread({
            organizationId: row.organizationId,
            userId: row.userId,
            threadId: createdThread.threadId,
            runtimeId: createdThread.runtimeId,
          })
          .catch((abandonError: unknown) => {
            console.warn(
              `Could not clean up automation thread ${createdThread?.threadId}:`,
              describeError(abandonError),
            );
          });
      }

      const reason = describeError(error).slice(0, 300);
      const [failed] = await db
        .update(automationRuns)
        .set({ status: "failed", error: reason, finishedAt: new Date() })
        .where(eq(automationRuns.id, runRow.id))
        .returning();

      if (createdThread) {
        await db
          .update(automations)
          .set({ lastStatus: "failed" })
          .where(
            and(eq(automations.id, row.id), eq(automations.lastThreadId, createdThread.threadId)),
          );
      } else {
        await db
          .update(automations)
          .set({ lastRunAt: now, lastStatus: "failed" })
          .where(eq(automations.id, row.id));
      }

      return viewRun(failed!);
    }
  }

  return {
    async list({ organizationId, userId }: AutomationViewer) {
      const rows = await db
        .select({ automation: automations, projectName: projects.name })
        .from(automations)
        .innerJoin(projects, eq(projects.id, automations.projectId))
        .where(and(eq(automations.organizationId, organizationId), eq(automations.userId, userId)))
        .orderBy(desc(automations.createdAt));
      return rows.map(({ automation, projectName }) => viewAutomation(automation, projectName));
    },

    async create(
      { organizationId, userId }: AutomationViewer,
      body: CreateAutomationBody,
    ): Promise<AutomationCreated> {
      const project = await projectsService.get(organizationId, body.projectId);

      if (!project) throw new NotFoundError("Project not found");

      const runtimeId = body.runtimeId ?? project.runtimeId;

      if (!runtimeId) throw new UnprocessableError("Choose a computer for this automation");

      if (project.directory && runtimeId !== project.runtimeId) {
        throw new UnprocessableError(
          "This project is a folder on one computer, so its automations run there",
        );
      }

      if (!(await runtimesService.get(organizationId, runtimeId, userId))) {
        throw new ForbiddenError("That computer is not available to you");
      }

      const now = new Date();
      let cron: string | null = null;
      let timezone: string | null = null;
      let nextRunAt: Date | null = null;
      let token: string | undefined;
      let tokenHash: string | null = null;
      let tokenHint: string | null = null;

      if (body.triggerKind === "schedule") {
        cron = body.cron!;
        timezone = body.timezone ?? (await preferencesService.timezone(userId));
        checkCron(cron, timezone, now);
        nextRunAt = nextRun(cron, timezone, now);
      } else {
        const issued = issueOpaqueToken(AUTOMATION_TOKEN_PREFIX);
        token = issued.token;
        tokenHash = issued.tokenHash;
        tokenHint = issued.tokenHint;
      }

      const row = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`automations:${userId}`}))`);
        const [owned] = await tx
          .select({ total: count() })
          .from(automations)
          .where(
            and(eq(automations.organizationId, organizationId), eq(automations.userId, userId)),
          );

        if ((owned?.total ?? 0) >= AUTOMATIONS_LIMIT) {
          throw new UnprocessableError(`You can have at most ${AUTOMATIONS_LIMIT} automations`);
        }

        const [made] = await tx
          .insert(automations)
          .values({
            organizationId,
            userId,
            projectId: project.id,
            runtimeId,
            name: body.name,
            triggerKind: body.triggerKind,
            cron,
            timezone,
            webhookTokenHash: tokenHash,
            webhookTokenHint: tokenHint,
            prompt: body.prompt,
            nextRunAt,
          })
          .returning();
        return made!;
      });

      const shown = viewAutomation(row, project.name);
      const created: AutomationCreated = { ...shown };

      if (token && shown.webhookPath) {
        created.webhookToken = token;
        created.webhookUrlPath = `${shown.webhookPath}/${token}`;
      }

      return created;
    },

    async update(viewer: AutomationViewer, id: string, body: UpdateAutomationBody) {
      const [found] = await db
        .select({ automation: automations, projectName: projects.name })
        .from(automations)
        .innerJoin(projects, eq(projects.id, automations.projectId))
        .where(ownedWhere(viewer, id));

      if (!found) return null;

      const current = found.automation;

      if (
        current.triggerKind === "webhook" &&
        (body.cron !== undefined || body.timezone !== undefined)
      ) {
        throw new UnprocessableError("Webhook automations do not have a schedule");
      }

      const changes: Partial<typeof automations.$inferInsert> = {};

      if (body.name !== undefined) changes.name = body.name;

      if (body.prompt !== undefined) changes.prompt = body.prompt;

      if (body.enabled !== undefined) changes.enabled = body.enabled;

      if (current.triggerKind === "schedule") {
        const nextCron = body.cron ?? current.cron;
        const nextTz = body.timezone ?? current.timezone;
        const nextEnabled = body.enabled ?? current.enabled;
        const timingChanged =
          body.cron !== undefined || body.timezone !== undefined || body.enabled === true;

        if (timingChanged && nextCron && nextTz) {
          const now = new Date();
          checkCron(nextCron, nextTz, now);
          changes.cron = nextCron;
          changes.timezone = nextTz;
          changes.nextRunAt = nextEnabled ? nextRun(nextCron, nextTz, now) : null;
        }

        if (body.enabled === false) changes.nextRunAt = null;
      }

      if (Object.keys(changes).length === 0) return viewAutomation(current, found.projectName);

      const [updated] = await db
        .update(automations)
        .set(changes)
        .where(ownedWhere(viewer, id))
        .returning();
      return updated ? viewAutomation(updated, found.projectName) : null;
    },

    async remove(viewer: AutomationViewer, id: string) {
      const deleted = await db
        .delete(automations)
        .where(ownedWhere(viewer, id))
        .returning({ id: automations.id });
      return deleted.length > 0;
    },

    async runs(viewer: AutomationViewer, id: string) {
      const [owned] = await db
        .select({ id: automations.id })
        .from(automations)
        .where(ownedWhere(viewer, id));

      if (!owned) throw new NotFoundError("Automation not found");

      const rows = await db
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.automationId, id))
        .orderBy(desc(automationRuns.createdAt))
        .limit(AUTOMATION_RUNS_LIMIT);
      return rows.map(viewRun);
    },

    async triggerManual(viewer: AutomationViewer, id: string) {
      const [row] = await db.select().from(automations).where(ownedWhere(viewer, id));

      if (!row) throw new NotFoundError("Automation not found");

      return execute(row, "Manual run");
    },

    async receiveWebhook(
      id: string,
      { token, body, headers, receivedAt = new Date() }: AutomationDelivery,
    ) {
      const [row] = await db.select().from(automations).where(eq(automations.id, id));

      if (!row || !row.webhookTokenHash || !verifyOpaqueTokenHash(token, row.webhookTokenHash)) {
        throw new NotFoundError("Automation not found");
      }

      if (!row.enabled) throw new UnprocessableError("This automation is turned off");

      if (!(await isMember(row.organizationId, row.userId))) {
        await disableRevoked(row, receivedAt);
        throw new ForbiddenError("The automation owner is no longer a member of this workspace");
      }

      const summary = summarizeWebhookPayload(body, headers);
      return execute(row, summary, body, receivedAt);
    },

    async fireScheduled(id: string, now = new Date()) {
      const [row] = await db.select().from(automations).where(eq(automations.id, id));

      if (!row || !row.enabled) return;

      if (!(await isMember(row.organizationId, row.userId))) {
        await disableRevoked(row, now);
        return;
      }

      await execute(row, `Scheduled run (${row.cron ?? "cron"})`, undefined, now);
    },

    async recordThreadEnded(
      threadId: string,
      status: Exclude<AutomationStatus, "running">,
      error?: string,
    ) {
      const [runRow] = await db
        .update(automationRuns)
        .set({ status, error: error ?? null, finishedAt: new Date() })
        .where(and(eq(automationRuns.threadId, threadId), eq(automationRuns.status, "running")))
        .returning({ automationId: automationRuns.automationId });

      if (!runRow) return;

      await db
        .update(automations)
        .set({ lastStatus: status })
        .where(
          and(eq(automations.id, runRow.automationId), eq(automations.lastThreadId, threadId)),
        );
    },
  };
}
