import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { variableEvents } from "@aven/db/schema/variable-events";
import { eq } from "drizzle-orm";

import { ConflictError, UnprocessableError } from "../../errors";
import { runtimesService } from "../runtimes/service";
import { variablesService } from "../variables/service";
import { keepSecretAnswers } from "./secret-answers";

const run =
  process.env.DATABASE_URL && process.env.PROVIDER_ENCRYPTION_KEY ? describe : describe.skip;

// What a run that stopped on a question leaves: the tool, and the questions it asked.
const continuation = (toolName: string, questionIds: string[]) => ({
  version: 1,
  agentId: "coding",
  sourceRunId: "run-1",
  interaction: {
    type: "tool-question",
    id: "i1",
    toolName,
    toolCallId: "c1",
    internalCallId: "ic1",
    questions: questionIds.map((id) => ({ id, text: `What is ${id}?` })),
  },
  state: {},
});

run("keepSecretAnswers (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "secrets");
  afterAll(cleanup);

  const input = (over: Partial<Parameters<typeof keepSecretAnswers>[0]> = {}) => ({
    organizationId: orgA,
    userId,
    projectId: project.id,
    continuation: continuation("request_secret", ["STRIPE_API_KEY"]),
    answers: [{ questionId: "STRIPE_API_KEY", value: "sk_test_never_in_history_1234" }],
    scope: "project" as const,
    ...over,
  });
  const inProject = {
    kind: "project" as const,
    organizationId: orgA,
    projectId: project.id,
    actorId: userId,
  };
  const mine = { kind: "personal" as const, organizationId: orgA, userId };
  const named = async (scope: typeof inProject | typeof mine) =>
    (await variablesService.list(scope)).map((variable) => variable.name);

  test("stores the answer as a secret and gives the agent a note, never the value", async () => {
    const kept = await keepSecretAnswers(input());

    expect(kept).toEqual([{ questionId: "STRIPE_API_KEY", value: "stored as STRIPE_API_KEY" }]);
    expect(JSON.stringify(kept)).not.toContain("never_in_history");
    const [stored] = await variablesService.list(inProject);
    expect(stored).toMatchObject({ name: "STRIPE_API_KEY", secret: true, value: null });
    // It is in the run that resumes, and is a secret there, so its output is hidden.
    const given = await variablesService.forRun({
      organizationId: orgA,
      projectId: project.id,
      userId,
    });
    expect(given).toContainEqual({
      name: "STRIPE_API_KEY",
      value: "sk_test_never_in_history_1234",
      secret: true,
    });
  });

  test("the history says it came from the agent's request, and holds no value", async () => {
    await keepSecretAnswers(
      input({
        continuation: continuation("request_secret", ["HISTORY_KEY"]),
        answers: [{ questionId: "HISTORY_KEY", value: "sk_history_must_not_be_kept_9999" }],
      }),
    );

    const events = await db
      .select()
      .from(variableEvents)
      .where(eq(variableEvents.name, "HISTORY_KEY"));
    expect(events).toEqual([
      expect.objectContaining({
        action: "created",
        secret: true,
        source: "agent",
        actorId: userId,
        projectId: project.id,
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("must_not_be_kept");
  });

  test("a person can keep it for themselves instead of the project", async () => {
    await keepSecretAnswers(
      input({
        continuation: continuation("request_secret", ["MY_OWN_TOKEN"]),
        answers: [{ questionId: "MY_OWN_TOKEN", value: "ghp_a_personal_token_5678" }],
        scope: "personal",
      }),
    );

    expect(await named(mine)).toContain("MY_OWN_TOKEN");
    expect(await named(inProject)).not.toContain("MY_OWN_TOKEN");
  });

  test("a person who would rather not gives nothing, and the agent is told so", async () => {
    const before = await named(inProject);
    const kept = await keepSecretAnswers(
      input({
        continuation: continuation("request_secret", ["SKIPPED_KEY"]),
        answers: [{ questionId: "SKIPPED_KEY", value: "x" }],
        skip: true,
      }),
    );

    expect(kept).toEqual([{ questionId: "SKIPPED_KEY", value: "not provided" }]);
    expect(await named(inProject)).toEqual(before);
  });

  test("any other question's answers are returned as they are, and nothing is stored", async () => {
    const before = await named(inProject);
    const answers = [{ questionId: "color", value: "blue" }];

    expect(
      await keepSecretAnswers(
        input({ continuation: continuation("ask_user", ["color"]), answers }),
      ),
    ).toEqual(answers);
    expect(await named(inProject)).toEqual(before);
  });

  test("answers that are not the questions' own store nothing", async () => {
    const before = await named(inProject);
    await expect(
      keepSecretAnswers(input({ answers: [{ questionId: "SOMETHING_ELSE", value: "v" }] })),
    ).rejects.toBeInstanceOf(UnprocessableError);
    expect(await named(inProject)).toEqual(before);
  });

  test("a question that is not a usable variable name is refused before anything is stored", async () => {
    const before = await named(inProject);
    for (const id of ["GIT_ASKPASS", "has space", "1STARTS_WITH_DIGIT"]) {
      await expect(
        keepSecretAnswers(
          input({
            continuation: continuation("request_secret", ["FINE_NAME", id]),
            answers: [
              { questionId: "FINE_NAME", value: "v" },
              { questionId: id, value: "v" },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableError);
    }
    expect(await named(inProject)).toEqual(before);
  });

  test("a continuation that cannot be read is a conflict, not a stored value", async () => {
    await expect(keepSecretAnswers(input({ continuation: { nope: true } }))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
