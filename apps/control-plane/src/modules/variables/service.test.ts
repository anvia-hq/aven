import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { environmentVariables } from "@aven/db/schema/environment-variables";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { NotFoundError, UnavailableError } from "../../errors";
import { runtimesService } from "../runtimes/service";
import { MAX_VARIABLES } from "./schema";
import { TooManyVariablesError, variablesService } from "./service";

const inProject = (organizationId: string, projectId: string) => ({
  kind: "project" as const,
  organizationId,
  projectId,
});

const run =
  process.env.DATABASE_URL && process.env.PROVIDER_ENCRYPTION_KEY ? describe : describe.skip;

run("variablesService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
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

  test("a run gets every variable of the project with its value, secrets included", async () => {
    const { project: mine } = await seedProject(orgA, userId, runner.id, "forrun");
    await variablesService.set(inProject(orgA, mine.id), "B_PLAIN", {
      value: "plain",
      secret: false,
    });
    await variablesService.set(inProject(orgA, mine.id), "A_SECRET", {
      value: "s3cret",
      secret: true,
    });

    expect(await variablesService.forRun(mine.id)).toEqual([
      { name: "A_SECRET", value: "s3cret", secret: true },
      { name: "B_PLAIN", value: "plain", secret: false },
    ]);
    expect(await variablesService.forRun(crypto.randomUUID())).toEqual([]);
  });

  describe("scopes (decision 0046)", () => {
    const otherId = `u-other-${crypto.randomUUID().slice(0, 8)}`;
    beforeAll(async () => {
      await db.insert(users).values({ id: otherId, name: "O", email: `${otherId}@aven.test` });
    });
    afterAll(async () => {
      await db.delete(users).where(eq(users.id, otherId));
    });

    const workspace = (organizationId: string) => ({ kind: "workspace" as const, organizationId });
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
      // Another organization has none of them.
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
      // The person's own list in the same organization is a different one.
      await variablesService.set(personal(orgB, userId), "ONE_MORE", { value: "1", secret: false });
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
