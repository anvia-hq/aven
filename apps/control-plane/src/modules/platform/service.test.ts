import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { inArray } from "drizzle-orm";

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
