import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { projects } from "@aven/db/schema/projects";
import { runtimes } from "@aven/db/schema/runtimes";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { eq, inArray } from "drizzle-orm";

import { seedProject } from "../../testing/seed-project";
import { platformService, registrationDefault } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("who owns the platform (real postgres)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const first = { id: `first-${tag}`, email: `first-${tag}@aven.test` };
  const second = { id: `second-${tag}`, email: `second-${tag}@aven.test` };
  const listed = { id: `listed-${tag}`, email: `Listed-${tag}@Aven.test` };
  const previousOwners = process.env.PLATFORM_OWNER_EMAILS;

  beforeAll(async () => {
    const row = (person: { id: string; email: string }, createdAt: Date) => ({
      ...person,
      name: person.id,
      emailVerified: false,
      createdAt,
      updatedAt: createdAt,
    });
    await db
      .insert(users)
      .values([
        row(first, new Date("1990-01-01")),
        row(second, new Date("1990-01-02")),
        row(listed, new Date()),
      ]);
  });

  afterAll(async () => {
    if (previousOwners === undefined) delete process.env.PLATFORM_OWNER_EMAILS;
    else process.env.PLATFORM_OWNER_EMAILS = previousOwners;

    await db.delete(users).where(inArray(users.id, [first.id, second.id, listed.id]));
  });

  test("the first account is an owner and the ones after it are not", async () => {
    delete process.env.PLATFORM_OWNER_EMAILS;
    expect(await platformService.isOwner(first)).toBe(true);
    expect(await platformService.isOwner(second)).toBe(false);
    expect(await platformService.isOwner(listed)).toBe(false);
  });

  test("an email in PLATFORM_OWNER_EMAILS is an owner too, whatever its case", async () => {
    process.env.PLATFORM_OWNER_EMAILS = ` other@aven.test, ${listed.email.toLowerCase()} `;
    expect(await platformService.isOwner(listed)).toBe(true);
    expect(await platformService.isOwner(first)).toBe(true);
    expect(await platformService.isOwner(second)).toBe(false);
  });

  test("lists every account, in the order they were made, with who owns the platform", async () => {
    process.env.PLATFORM_OWNER_EMAILS = listed.email;
    const people = await platformService.listPeople();
    const mine = people.filter((person) => [first.id, second.id, listed.id].includes(person.id));
    expect(mine.map((person) => [person.id, person.owner])).toEqual([
      [first.id, true],
      [second.id, false],
      [listed.id, true],
    ]);
    expect(mine.every((person) => person.workspaces.length === 0)).toBe(true);
    expect(mine.every((person) => person.lastActiveAt === null)).toBe(true);
  });
});

describe("whether registration starts open", () => {
  test("is open unless the install says closed", () => {
    expect(registrationDefault({})).toBe(true);
    expect(registrationDefault({ AVEN_REGISTRATION: "open" })).toBe(true);
    expect(registrationDefault({ AVEN_REGISTRATION: "" })).toBe(true);
    expect(registrationDefault({ AVEN_REGISTRATION: "nonsense" })).toBe(true);
  });

  test("is closed for closed, whatever its case or spacing", () => {
    for (const value of ["closed", "CLOSED", " Closed "]) {
      expect(registrationDefault({ AVEN_REGISTRATION: value })).toBe(false);
    }
  });
});

run("removing an account (real postgres)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const previousOwners = process.env.PLATFORM_OWNER_EMAILS;
  const owner = { id: `rm-owner-${tag}`, email: `rm-owner-${tag}@aven.test` };
  const lead = { id: `rm-lead-${tag}`, email: `rm-lead-${tag}@aven.test` };
  const mate = { id: `rm-mate-${tag}`, email: `rm-mate-${tag}@aven.test` };
  const alone = { id: `rm-alone-${tag}`, email: `rm-alone-${tag}@aven.test` };
  const shared = `rm-shared-${tag}`;
  const solo = `rm-solo-${tag}`;
  const everyone = [owner, lead, mate, alone];
  const away: string[] = [];

  beforeAll(async () => {
    process.env.PLATFORM_OWNER_EMAILS = owner.email;
    const now = Date.now();
    await db.insert(users).values(
      everyone.map((person, index) => ({
        ...person,
        name: person.id,
        createdAt: new Date(now + index * 1000),
      })),
    );
    await db.insert(organizations).values([
      { id: shared, name: "Shared", slug: shared },
      { id: solo, name: "Solo", slug: solo },
    ]);
    await db.insert(members).values([
      { id: `m1-${tag}`, organizationId: shared, userId: lead.id, role: "owner" },
      { id: `m2-${tag}`, organizationId: shared, userId: mate.id, role: "member" },
      { id: `m3-${tag}`, organizationId: solo, userId: alone.id, role: "owner" },
    ]);
  });

  afterAll(async () => {
    if (previousOwners === undefined) delete process.env.PLATFORM_OWNER_EMAILS;
    else process.env.PLATFORM_OWNER_EMAILS = previousOwners;

    await db.delete(organizations).where(inArray(organizations.id, [shared, solo]));
    await db.delete(users).where(
      inArray(
        users.id,
        everyone.map((person) => person.id),
      ),
    );
  });

  const exists = async (id: string) =>
    (await db.select({ id: users.id }).from(users).where(eq(users.id, id))).length === 1;
  const putAway = (thread: { id: string }) => void away.push(thread.id);

  test("refuses your own account, a platform owner and one that is not there", async () => {
    await expect(platformService.removePerson(owner, owner.id, putAway)).rejects.toThrow(
      "your own account",
    );
    await expect(platformService.removePerson(lead, owner.id, putAway)).rejects.toThrow(
      "platform owner",
    );
    await expect(platformService.removePerson(owner, `nobody-${tag}`, putAway)).rejects.toThrow(
      "no such account",
    );
    expect(await exists(owner.id)).toBe(true);
  });

  test("refuses the owner of a workspace that has other members", async () => {
    await expect(platformService.removePerson(owner, lead.id, putAway)).rejects.toThrow(
      "owns the workspace Shared",
    );
    expect(await exists(lead.id)).toBe(true);
  });

  test("removes a member and leaves the workspace to the others", async () => {
    await platformService.removePerson(owner, mate.id, putAway);
    expect(await exists(mate.id)).toBe(false);
    const left = await db.select().from(members).where(eq(members.organizationId, shared));
    expect(left.map((row) => row.userId)).toEqual([lead.id]);
  });

  test("removes a person who is alone in a workspace together with it", async () => {
    await platformService.removePerson(owner, alone.id, putAway);
    expect(await exists(alone.id)).toBe(false);
    expect(
      await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, solo)),
    ).toEqual([]);
  });

  describe("what other people use", () => {
    const newcomer = async (role: string) => {
      const id = `rm-${role}-${tag}`;
      await db
        .insert(users)
        .values({ id, email: `${id}@aven.test`, name: id, createdAt: new Date() });
      await db.insert(members).values({
        id: `m-${id}`,
        organizationId: shared,
        userId: id,
        role: "member",
      });
      return { id, email: `${id}@aven.test`, name: id };
    };
    const runnerOf = async (ownerId: string | null, name: string) => {
      const [runner] = await db
        .insert(runtimes)
        .values({
          organizationId: shared,
          ownerId,
          name: `${name}-${tag}`,
          tokenHash: `hash-${name}-${tag}`,
          tokenHint: "hint",
        })
        .returning();
      return runner!;
    };
    const threadIn = (projectId: string, runtimeId: string, createdBy: string) =>
      db
        .insert(threads)
        .values({ organizationId: shared, projectId, runtimeId, createdBy, title: "t" });
    const cleanup = async (ids: string[], runnerIds: string[]) => {
      await db.delete(projects).where(eq(projects.organizationId, shared));
      await db.delete(runtimes).where(inArray(runtimes.id, runnerIds));
      await db.delete(users).where(inArray(users.id, ids));
    };

    test("a runner that another person's project uses is not removed with its owner", async () => {
      const adder = await newcomer("adder");
      const runner = await runnerOf(adder.id, "added");
      await seedProject(shared, lead.id, runner.id, `a-${tag}`);
      await expect(platformService.removePerson(owner, adder.id, putAway)).rejects.toThrow(
        "added the runner",
      );
      expect(await exists(adder.id)).toBe(true);
      await cleanup([adder.id], [runner.id]);
    });

    test("a project with other people's threads is not removed with its importer", async () => {
      const importer = await newcomer("importer");
      const runner = await runnerOf(null, "plain");
      const { project } = await seedProject(shared, importer.id, runner.id, `i-${tag}`);
      await threadIn(project.id, runner.id, lead.id);
      await expect(platformService.removePerson(owner, importer.id, putAway)).rejects.toThrow(
        "imported the project",
      );
      expect(await exists(importer.id)).toBe(true);
      await cleanup([importer.id], [runner.id]);
    });

    test("a GitHub account that another person's project uses is not removed with who connected it", async () => {
      const connector = await newcomer("connector");
      const runner = await runnerOf(null, "other");
      const { installation } = await seedProject(shared, connector.id, runner.id, `c-${tag}`);
      await db.delete(projects).where(eq(projects.organizationId, shared));
      await db.insert(projects).values({
        organizationId: shared,
        createdBy: lead.id,
        runtimeId: runner.id,
        githubInstallationId: installation.id,
        repoFullName: `acme/g-${tag}`,
        cloneUrl: `https://github.com/acme/g-${tag}.git`,
        defaultBranch: "main",
        name: `g-${tag}`,
      });
      await expect(platformService.removePerson(owner, connector.id, putAway)).rejects.toThrow(
        "connected the GitHub account",
      );
      expect(await exists(connector.id)).toBe(true);
      await cleanup([connector.id], [runner.id]);
    });

    test("a person whose project only they use is removed and their threads are put away", async () => {
      const importer = await newcomer("solo-importer");
      const runner = await runnerOf(null, "free");
      const { project } = await seedProject(shared, importer.id, runner.id, `s-${tag}`);
      await threadIn(project.id, runner.id, importer.id);
      away.length = 0;
      await platformService.removePerson(owner, importer.id, putAway);
      expect(await exists(importer.id)).toBe(false);
      expect(away).toHaveLength(1);
      await cleanup([importer.id], [runner.id]);
    });
  });
});
