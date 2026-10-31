import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { projectVariables } from "@aven/db/schema/project-variables";
import { eq } from "drizzle-orm";

import { NotFoundError, UnavailableError } from "../../errors";
import { runtimesService } from "../runtimes/service";
import { MAX_VARIABLES } from "./schema";
import { TooManyVariablesError, variablesService } from "./service";

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
    await variablesService.set(orgA, project.id, "DATABASE_URL", {
      value: "postgres://localhost/app",
      secret: false,
    });
    expect(await variablesService.list(orgA, project.id)).toEqual([
      expect.objectContaining({
        name: "DATABASE_URL",
        secret: false,
        value: "postgres://localhost/app",
        valueHint: null,
      }),
    ]);
  });

  test("a secret is never returned, only its last characters, and is stored encrypted", async () => {
    const set = await variablesService.set(orgA, project.id, "API_KEY", {
      value: "sk-super-secret-1234",
      secret: true,
    });
    expect(set).toMatchObject({ secret: true, value: null, valueHint: "1234" });
    expect(JSON.stringify(await variablesService.list(orgA, project.id))).not.toContain(
      "super-secret",
    );
    const [row] = await db
      .select()
      .from(projectVariables)
      .where(eq(projectVariables.name, "API_KEY"));
    expect(row!.valueEncrypted).not.toContain("super-secret");
  });

  test("setting a name again replaces its value and whether it is a secret", async () => {
    await variablesService.set(orgA, project.id, "MODE", { value: "dev", secret: false });
    await variablesService.set(orgA, project.id, "MODE", { value: "prod", secret: true });
    const mode = (await variablesService.list(orgA, project.id)).find((v) => v.name === "MODE");
    expect(mode).toMatchObject({ secret: true, value: null });
  });

  test("a short secret shows no hint, as it would be shown whole", async () => {
    const set = await variablesService.set(orgA, project.id, "PIN", {
      value: "1234",
      secret: true,
    });
    expect(set.valueHint).toBeNull();
  });

  test("a value that cannot be decrypted is unavailable, not a server error", async () => {
    await db.insert(projectVariables).values({
      projectId: project.id,
      name: "BROKEN",
      valueEncrypted: "not.a.value",
    });
    await expect(variablesService.list(orgA, project.id)).rejects.toBeInstanceOf(UnavailableError);
    await variablesService.remove(orgA, project.id, "BROKEN");
  });

  test("another organization's project is not found", async () => {
    await expect(variablesService.list(orgB, project.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      variablesService.set(orgB, project.id, "X", { value: "1", secret: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(variablesService.remove(orgB, project.id, "MODE")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  test("removing a variable removes it; an unknown one is not found", async () => {
    await variablesService.remove(orgA, project.id, "MODE");
    expect((await variablesService.list(orgA, project.id)).map((v) => v.name)).not.toContain(
      "MODE",
    );
    await expect(variablesService.remove(orgA, project.id, "MODE")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  test("a project has a limited number of variables, and replacing one is still allowed", async () => {
    const { project: full } = await seedProject(orgA, userId, runner.id, "full");
    await db.insert(projectVariables).values(
      Array.from({ length: MAX_VARIABLES }, (_, index) => ({
        projectId: full.id,
        name: `V${index}`,
        valueEncrypted: "x.y.z",
      })),
    );
    await expect(
      variablesService.set(orgA, full.id, "ONE_MORE", { value: "1", secret: false }),
    ).rejects.toBeInstanceOf(TooManyVariablesError);
    await variablesService.set(orgA, full.id, "V0", { value: "again", secret: false });
  });
});
