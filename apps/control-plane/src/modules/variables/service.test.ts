import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { environmentVariables } from "@aven/db/schema/environment-variables";
import { variableEvents } from "@aven/db/schema/variable-events";
import { members } from "@aven/db/schema/members";
import { users } from "@aven/db/schema/users";
import { asc, eq } from "drizzle-orm";

import { ForbiddenError, NotFoundError, UnavailableError } from "../../errors";
import { encryptSecret } from "../../crypto";
import { runtimesService } from "../runtimes/service";
import { MAX_VARIABLES } from "./schema";
import { TooManyVariablesError, variablesService } from "./service";

const run =
  process.env.DATABASE_URL && process.env.PROVIDER_ENCRYPTION_KEY ? describe : describe.skip;

run("variablesService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const inProject = (organizationId: string, projectId: string, actorId = userId) => ({
    kind: "project" as const,
    organizationId,
    projectId,
    actorId,
  });
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "vars");

  afterAll(cleanup);

  test("a plain variable is returned with its value", async () => {
    await variablesService.set(inProject(orgA, project.id), "DATABASE_URL", {
      value: "postgres://localhost/app",
      secret: false,
    });
    expect(await variablesService.list(inProject(orgA, project.id))).toEqual([
      expect.objectContaining({
        name: "DATABASE_URL",
        secret: false,
        value: "postgres://localhost/app",
        valueHint: null,
      }),
    ]);
  });

  test("a secret is never returned, only its last characters, and is stored encrypted", async () => {
    const set = await variablesService.set(inProject(orgA, project.id), "API_KEY", {
      value: "sk-super-secret-1234",
      secret: true,
    });
    expect(set).toMatchObject({ secret: true, value: null, valueHint: "1234" });
    expect(JSON.stringify(await variablesService.list(inProject(orgA, project.id)))).not.toContain(
      "super-secret",
    );
    const [row] = await db
      .select()
      .from(environmentVariables)
      .where(eq(environmentVariables.name, "API_KEY"));
    expect(row!.valueEncrypted).not.toContain("super-secret");
  });

  test("setting a name again replaces its value and whether it is a secret", async () => {
    await variablesService.set(inProject(orgA, project.id), "MODE", {
      value: "dev",
      secret: false,
    });
    await variablesService.set(inProject(orgA, project.id), "MODE", {
      value: "prod",
      secret: true,
    });
    const mode = (await variablesService.list(inProject(orgA, project.id))).find(
      (v) => v.name === "MODE",
    );
    expect(mode).toMatchObject({ secret: true, value: null });
  });

  test("a short secret shows no hint, as it would be shown whole", async () => {
    const set = await variablesService.set(inProject(orgA, project.id), "PIN", {
      value: "1234",
      secret: true,
    });
    expect(set.valueHint).toBeNull();
  });

  test("a value that cannot be decrypted is unavailable, not a server error", async () => {
    await db.insert(environmentVariables).values({
      organizationId: orgA,
      projectId: project.id,
      name: "BROKEN",
      valueEncrypted: "not.a.value",
    });
    await expect(variablesService.list(inProject(orgA, project.id))).rejects.toBeInstanceOf(
      UnavailableError,
    );
    await variablesService.remove(inProject(orgA, project.id), "BROKEN");
  });

  test("another organization's project is not found", async () => {
    await expect(variablesService.list(inProject(orgB, project.id))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      variablesService.set(inProject(orgB, project.id), "X", { value: "1", secret: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      variablesService.remove(inProject(orgB, project.id), "MODE"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test("removing a variable removes it; an unknown one is not found", async () => {
    await variablesService.remove(inProject(orgA, project.id), "MODE");
    expect(
      (await variablesService.list(inProject(orgA, project.id))).map((v) => v.name),
    ).not.toContain("MODE");
    await expect(
      variablesService.remove(inProject(orgA, project.id), "MODE"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test("a run gets the project's variables with their values, secrets included", async () => {
    const { project: mine } = await seedProject(orgA, userId, runner.id, "forrun");
    await variablesService.set(inProject(orgA, mine.id), "B_PLAIN", {
      value: "plain",
      secret: false,
    });
    await variablesService.set(inProject(orgA, mine.id), "A_SECRET", {
      value: "s3cret",
      secret: true,
    });

    const given = await variablesService.forRun({
      organizationId: orgA,
      projectId: mine.id,
      userId,
    });
    expect(given.filter((variable) => /^[AB]_/.test(variable.name))).toEqual([
      { name: "A_SECRET", value: "s3cret", secret: true },
      { name: "B_PLAIN", value: "plain", secret: false },
    ]);
  });

  test("a run a teammate started leaves out the creator's personal variables (decision 0179)", async () => {
    const { project: mine } = await seedProject(orgA, userId, runner.id, "driven");
    await variablesService.set(inProject(orgA, mine.id), "SHARED_ONE", {
      value: "project",
      secret: false,
    });
    await variablesService.set({ kind: "personal", organizationId: orgA, userId }, "SHARED_ONE", {
      value: "mine",
      secret: false,
    });
    await variablesService.set({ kind: "personal", organizationId: orgA, userId }, "ONLY_MINE", {
      value: "mine",
      secret: false,
    });
    const run = { organizationId: orgA, projectId: mine.id, userId };
    const own = await variablesService.forRun(run);
    expect(own.find((variable) => variable.name === "SHARED_ONE")?.value).toBe("mine");
    const driven = await variablesService.forRun({ ...run, withoutPersonal: true });
    expect(driven.find((variable) => variable.name === "SHARED_ONE")?.value).toBe("project");
    expect(driven.find((variable) => variable.name === "ONLY_MINE")).toBeUndefined();
  });

  describe("scopes (decision 0046)", () => {
    const otherId = `u-other-${crypto.randomUUID().slice(0, 8)}`;
    beforeAll(async () => {
      await db.insert(users).values({ id: otherId, name: "O", email: `${otherId}@aven.test` });
      await db.insert(members).values([
        { id: `m-a-${userId}`, organizationId: orgA, userId, role: "owner" },
        { id: `m-b-${userId}`, organizationId: orgB, userId, role: "owner" },
        { id: `m-a-${otherId}`, organizationId: orgA, userId: otherId, role: "member" },
      ]);
    });
    afterAll(async () => {
      await db.delete(users).where(eq(users.id, otherId));
    });

    const workspace = (organizationId: string, actorId = userId) => ({
      kind: "workspace" as const,
      organizationId,
      actorId,
    });
    const personal = (organizationId: string, userId: string) => ({
      kind: "personal" as const,
      organizationId,
      userId,
    });
    const valueOf = async (scope: Parameters<typeof variablesService.list>[0], name: string) =>
      (await variablesService.list(scope)).find((variable) => variable.name === name)?.value;

    test("a name can be set in every scope, and each scope sees only its own", async () => {
      const { project: scoped } = await seedProject(orgA, userId, runner.id, "scoped");
      const put = (scope: Parameters<typeof variablesService.list>[0], value: string) =>
        variablesService.set(scope, "REGION", { value, secret: false });
      await put(workspace(orgA), "workspace");
      await put(inProject(orgA, scoped.id), "project");
      await put(personal(orgA, userId), "mine");
      await put(personal(orgA, otherId), "theirs");

      expect(await valueOf(workspace(orgA), "REGION")).toBe("workspace");
      expect(await valueOf(inProject(orgA, scoped.id), "REGION")).toBe("project");
      expect(await valueOf(personal(orgA, userId), "REGION")).toBe("mine");
      expect(await valueOf(personal(orgA, otherId), "REGION")).toBe("theirs");
      expect(await variablesService.list(workspace(orgB))).toEqual([]);
      expect(await variablesService.list(personal(orgB, userId))).toEqual([]);
    });

    test("setting a name again in a scope replaces it there and nowhere else", async () => {
      await variablesService.set(workspace(orgA), "TIER", { value: "one", secret: false });
      await variablesService.set(personal(orgA, userId), "TIER", { value: "mine", secret: false });
      await variablesService.set(workspace(orgA), "TIER", { value: "two", secret: false });

      expect(await valueOf(workspace(orgA), "TIER")).toBe("two");
      expect(await valueOf(personal(orgA, userId), "TIER")).toBe("mine");
      const rows = await variablesService.list(workspace(orgA));
      expect(rows.filter((variable) => variable.name === "TIER")).toHaveLength(1);
    });

    test("removing in one scope leaves the same name in the others", async () => {
      await variablesService.set(workspace(orgA), "GONE", { value: "w", secret: false });
      await variablesService.set(personal(orgA, userId), "GONE", { value: "p", secret: false });
      await variablesService.remove(personal(orgA, userId), "GONE");

      expect(await valueOf(workspace(orgA), "GONE")).toBe("w");
      expect(await valueOf(personal(orgA, userId), "GONE")).toBeUndefined();
    });

    test("the limit is per scope", async () => {
      await db.insert(environmentVariables).values(
        Array.from({ length: MAX_VARIABLES }, (_, index) => ({
          organizationId: orgB,
          name: `W${index}`,
          valueEncrypted: "x.y.z",
        })),
      );
      await expect(
        variablesService.set(workspace(orgB), "ONE_MORE", { value: "1", secret: false }),
      ).rejects.toBeInstanceOf(TooManyVariablesError);
      await variablesService.set(personal(orgB, userId), "ONE_MORE", { value: "1", secret: false });
    });

    test("a run gets the workspace's, then the project's, then the sender's own, by name", async () => {
      const { project: merged } = await seedProject(orgA, userId, runner.id, "merged");
      const set = (
        scope: Parameters<typeof variablesService.list>[0],
        name: string,
        value: string,
      ) => variablesService.set(scope, name, { value, secret: name.startsWith("S_") });
      const project = inProject(orgA, merged.id);
      await set(workspace(orgA), "M_ONLY_WORKSPACE", "w");
      await set(workspace(orgA), "M_OVER_PROJECT", "workspace");
      await set(project, "M_OVER_PROJECT", "project");
      await set(workspace(orgA), "M_OVER_PERSONAL", "workspace");
      await set(project, "M_OVER_PERSONAL", "project");
      await set(personal(orgA, userId), "M_OVER_PERSONAL", "mine");
      await set(personal(orgA, otherId), "M_THEIRS", "theirs");
      await set(personal(orgA, userId), "S_MINE_SECRET", "my-secret-value");
      await db.insert(environmentVariables).values({
        organizationId: orgB,
        name: "M_OTHER_ORG",
        valueEncrypted: encryptSecret("elsewhere"),
      });

      const given = await variablesService.forRun({
        organizationId: orgA,
        projectId: merged.id,
        userId,
      });
      const mine = Object.fromEntries(
        given.filter((v) => /^(M|S)_/.test(v.name)).map((v) => [v.name, v.value]),
      );
      expect(mine).toEqual({
        M_ONLY_WORKSPACE: "w",
        M_OVER_PROJECT: "project",
        M_OVER_PERSONAL: "mine",
        S_MINE_SECRET: "my-secret-value",
      });
      expect(given.find((v) => v.name === "S_MINE_SECRET")?.secret).toBe(true);
      expect(given.filter((v) => v.name === "M_OVER_PERSONAL")).toHaveLength(1);

      const theirs = await variablesService.forRun({
        organizationId: orgA,
        projectId: merged.id,
        userId: otherId,
      });
      expect(theirs.find((v) => v.name === "M_OVER_PERSONAL")?.value).toBe("project");
      expect(theirs.find((v) => v.name === "M_THEIRS")?.value).toBe("theirs");
      expect(theirs.find((v) => v.name === "S_MINE_SECRET")).toBeUndefined();
    });

    test("only an owner or an admin changes the workspace's variables; anyone in it reads them", async () => {
      const asMember = workspace(orgA, otherId);

      await variablesService.set(workspace(orgA), "ADMIN_SET", { value: "1", secret: false });
      await expect(
        variablesService.set(asMember, "MEMBER_SET", { value: "1", secret: false }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(variablesService.remove(asMember, "ADMIN_SET")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(await valueOf(asMember, "ADMIN_SET")).toBe("1");
      await expect(
        variablesService.set(workspace(orgB, otherId), "X", { value: "1", secret: false }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      await variablesService.set(personal(orgA, otherId), "MINE", { value: "1", secret: false });
      await db
        .update(members)
        .set({ role: "member, admin" })
        .where(eq(members.id, `m-a-${otherId}`));
      await variablesService.set(asMember, "MEMBER_SET", { value: "1", secret: false });
    });

    describe("history (decision 0048)", () => {
      const eventsOf = (name: string) =>
        db
          .select()
          .from(variableEvents)
          .where(eq(variableEvents.name, name))
          .orderBy(asc(variableEvents.createdAt), asc(variableEvents.id));

      test("a variable's life is a created, an updated and a removed event, by who did it", async () => {
        const { project: tracked } = await seedProject(orgA, userId, runner.id, "tracked");
        const scope = inProject(orgA, tracked.id);
        await variablesService.set(scope, "TRACKED_ONE", { value: "a", secret: false });
        await variablesService.set(scope, "TRACKED_ONE", { value: "b", secret: true });
        await variablesService.remove(scope, "TRACKED_ONE");

        const events = await eventsOf("TRACKED_ONE");
        expect(events.map((event) => [event.action, event.secret])).toEqual([
          ["created", false],
          ["updated", true],
          ["removed", true],
        ]);
        for (const event of events) {
          expect(event).toMatchObject({
            organizationId: orgA,
            projectId: tracked.id,
            userId: null,
            actorId: userId,
            source: "settings",
          });
        }
      });

      test("the scope of an event is the variable's: a person's own, the workspace's", async () => {
        await variablesService.set(personal(orgA, userId), "TRACKED_PERSONAL", {
          value: "x",
          secret: false,
        });
        await variablesService.set(workspace(orgA), "TRACKED_WORKSPACE", {
          value: "x",
          secret: false,
        });

        const [mine] = await eventsOf("TRACKED_PERSONAL");
        expect(mine).toMatchObject({ projectId: null, userId, actorId: userId });
        const [shared] = await eventsOf("TRACKED_WORKSPACE");
        expect(shared).toMatchObject({ projectId: null, userId: null, actorId: userId });
      });

      test("no value is kept, however it is read: not in a column, not in the text of a row", async () => {
        await variablesService.set(personal(orgA, userId), "TRACKED_SECRET", {
          value: "sk_live_a_value_that_must_not_be_kept_1234",
          secret: true,
        });

        const rows = await eventsOf("TRACKED_SECRET");
        expect(JSON.stringify(rows)).not.toContain("must_not_be_kept");
        expect(JSON.stringify(rows)).not.toContain("1234");
        expect(Object.keys(rows[0]!).sort()).toEqual(
          [
            "action",
            "actorId",
            "createdAt",
            "id",
            "name",
            "organizationId",
            "projectId",
            "secret",
            "source",
            "userId",
          ].sort(),
        );
      });

      test("a change that fails leaves no event", async () => {
        await expect(
          variablesService.remove(workspace(orgA), "NEVER_EXISTED"),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await eventsOf("NEVER_EXISTED")).toEqual([]);

        const plain = `u-plain-${crypto.randomUUID().slice(0, 8)}`;
        await db.insert(users).values({ id: plain, name: "P", email: `${plain}@aven.test` });
        await db
          .insert(members)
          .values({ id: `m-plain-${plain}`, organizationId: orgA, userId: plain, role: "member" });
        await expect(
          variablesService.set(workspace(orgA, plain), "REFUSED", { value: "x", secret: false }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(await eventsOf("REFUSED")).toEqual([]);
      });

      test("the history is read newest first, with who did it, and never a value", async () => {
        const { project: read } = await seedProject(orgA, userId, runner.id, "readhistory");
        const scope = inProject(orgA, read.id);
        await variablesService.set(scope, "HIST_A", { value: "first-value", secret: false });
        await variablesService.set(scope, "HIST_A", { value: "second-value", secret: true });
        await variablesService.remove(scope, "HIST_A");

        const history = await variablesService.history(scope);

        expect(history.map((event) => event.action)).toEqual(["removed", "updated", "created"]);
        expect(history.every((event) => event.name === "HIST_A" && event.actor === "T")).toBe(true);
        expect(JSON.stringify(history)).not.toContain("-value");
        expect(Object.keys(history[0]!).sort()).toEqual(
          ["action", "actor", "createdAt", "id", "name", "secret", "source"].sort(),
        );
      });

      test("each scope reads its own history only, and a person's own is theirs alone", async () => {
        await variablesService.set(personal(orgA, otherId), "HIST_THEIRS", {
          value: "x",
          secret: false,
        });
        await variablesService.set(personal(orgA, userId), "HIST_MINE", {
          value: "x",
          secret: false,
        });

        const mine = (await variablesService.history(personal(orgA, userId))).map((e) => e.name);
        const theirs = (await variablesService.history(personal(orgA, otherId))).map((e) => e.name);
        expect(mine).toContain("HIST_MINE");
        expect(mine).not.toContain("HIST_THEIRS");
        expect(theirs).toContain("HIST_THEIRS");
        expect(theirs).not.toContain("HIST_MINE");
        const shared = (await variablesService.history(workspace(orgA))).map((e) => e.name);
        expect(shared).not.toContain("HIST_MINE");
        expect(await variablesService.history(workspace(orgB))).toEqual([]);
      });

      test("another organization's project has no history to read", async () => {
        const { project: elsewhere } = await seedProject(orgA, userId, runner.id, "elsewhere");
        await expect(
          variablesService.history(inProject(orgB, elsewhere.id)),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      test("only the latest hundred are read", async () => {
        const { project: busy } = await seedProject(orgA, userId, runner.id, "busy");
        await db.insert(variableEvents).values(
          Array.from({ length: 105 }, (_, index) => ({
            organizationId: orgA,
            projectId: busy.id,
            actorId: userId,
            name: `BUSY_${index}`,
            action: "created" as const,
            secret: false,
            createdAt: new Date(Date.now() - (105 - index) * 1000),
          })),
        );

        const history = await variablesService.history(inProject(orgA, busy.id));

        expect(history).toHaveLength(100);
        expect(history[0]!.name).toBe("BUSY_104");
        expect(history.map((event) => event.name)).not.toContain("BUSY_0");
      });

      test("an event outlives the variable and the person who made it", async () => {
        const gone = `u-gone-${crypto.randomUUID().slice(0, 8)}`;
        await db.insert(users).values({ id: gone, name: "G", email: `${gone}@aven.test` });
        await db
          .insert(members)
          .values({ id: `m-gone-${gone}`, organizationId: orgA, userId: gone, role: "admin" });
        await variablesService.set(workspace(orgA, gone), "OUTLIVES", {
          value: "x",
          secret: false,
        });
        await variablesService.remove(workspace(orgA, gone), "OUTLIVES");
        expect(await variablesService.list(workspace(orgA))).not.toContainEqual(
          expect.objectContaining({ name: "OUTLIVES" }),
        );

        await db.delete(users).where(eq(users.id, gone));

        const events = await eventsOf("OUTLIVES");
        expect(events.map((event) => event.action)).toEqual(["created", "removed"]);
        expect(events.every((event) => event.actorId === null)).toBe(true);
      });
    });

    test("the database refuses a row of two scopes", async () => {
      const { project: both } = await seedProject(orgA, userId, runner.id, "both");
      await expect(
        (async () => {
          await db.insert(environmentVariables).values({
            organizationId: orgA,
            projectId: both.id,
            userId,
            name: "BOTH",
            valueEncrypted: "x.y.z",
          });
        })(),
      ).rejects.toThrow();
    });
  });

  test("a project has a limited number of variables, and replacing one is still allowed", async () => {
    const { project: full } = await seedProject(orgA, userId, runner.id, "full");
    await db.insert(environmentVariables).values(
      Array.from({ length: MAX_VARIABLES }, (_, index) => ({
        organizationId: orgA,
        projectId: full.id,
        name: `V${index}`,
        valueEncrypted: "x.y.z",
      })),
    );
    await expect(
      variablesService.set(inProject(orgA, full.id), "ONE_MORE", { value: "1", secret: false }),
    ).rejects.toBeInstanceOf(TooManyVariablesError);
    await variablesService.set(inProject(orgA, full.id), "V0", { value: "again", secret: false });
  });
});
