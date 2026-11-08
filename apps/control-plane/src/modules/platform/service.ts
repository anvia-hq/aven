import { db } from "@aven/db/client";
import { threads } from "@aven/db/schema/threads";
import { invitations } from "@aven/db/schema/invitations";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { sessions } from "@aven/db/schema/sessions";
import { users } from "@aven/db/schema/users";
import { and, asc, eq, gt, inArray, max, ne, sql } from "drizzle-orm";

import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import type { PutAwayThread } from "../threads/types";

const REGISTRATION_KEY = "registration_enabled";

function ownerEmails() {
  return (process.env.PLATFORM_OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

const isListedOwner = (email: string) => ownerEmails().includes(email.toLowerCase());

async function firstUserId() {
  const [first] = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return first?.id;
}

export function registrationDefault(env: Record<string, string | undefined> = process.env) {
  return env.AVEN_REGISTRATION?.trim().toLowerCase() !== "closed";
}

export const platformService = {
  async isOwner(person: { id: string; email: string }) {
    return isListedOwner(person.email) || (await firstUserId()) === person.id;
  },

  async listPeople() {
    const everyone = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt), asc(users.id));
    const memberships = await db
      .select({
        userId: members.userId,
        id: organizations.id,
        name: organizations.name,
        role: members.role,
      })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .orderBy(asc(organizations.name));
    const seen = await db
      .select({ userId: sessions.userId, at: max(sessions.updatedAt) })
      .from(sessions)
      .groupBy(sessions.userId);
    const lastSeen = new Map(seen.map((row) => [row.userId, row.at]));
    const first = everyone[0]?.id;
    return everyone.map((person) => ({
      ...person,
      owner: person.id === first || isListedOwner(person.email),
      lastActiveAt: lastSeen.get(person.id) ?? null,
      workspaces: memberships
        .filter((membership) => membership.userId === person.id)
        .map(({ id, name, role }) => ({ id, name, role })),
    }));
  },

  async removePerson(actor: { id: string }, personId: string, putAway: PutAwayThread) {
    if (personId === actor.id) throw new ForbiddenError("You cannot remove your own account");
    const [person] = await db.select().from(users).where(eq(users.id, personId));
    if (!person) throw new NotFoundError("There is no such account");
    if (await this.isOwner(person)) throw new ForbiddenError("A platform owner cannot be removed");

    const memberships = await db
      .select({
        organizationId: members.organizationId,
        name: organizations.name,
        role: members.role,
      })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(eq(members.userId, personId));
    const aloneIn: string[] = [];
    for (const membership of memberships) {
      const [others] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(members)
        .where(
          and(eq(members.organizationId, membership.organizationId), ne(members.userId, personId)),
        );
      if (!others?.count) aloneIn.push(membership.organizationId);
      else if (membership.role === "owner") {
        throw new ConflictError(
          `${person.name} owns the workspace ${membership.name}, which has other members. Remove them from it or give it to someone else first`,
        );
      }
    }

    const running = await db
      .select({ id: threads.id, runtimeId: threads.runtimeId })
      .from(threads)
      .where(and(eq(threads.createdBy, personId), ne(threads.state, "archived")));

    await db.transaction(async (tx) => {
      if (aloneIn.length > 0)
        await tx.delete(organizations).where(inArray(organizations.id, aloneIn));
      await tx.delete(users).where(eq(users.id, personId));
    });
    for (const thread of running) putAway(thread);
  },

  async isRegistrationEnabled() {
    const [row] = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, REGISTRATION_KEY));
    return row ? row.value !== "false" : registrationDefault();
  },

  async setRegistrationEnabled(enabled: boolean) {
    const value = String(enabled);
    await db
      .insert(platformSettings)
      .values({ key: REGISTRATION_KEY, value })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value } });
  },

  async canRegister(email: string) {
    if (isListedOwner(email) || (await this.isRegistrationEnabled())) return true;
    const [invitation] = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          sql`lower(${invitations.email}) = ${email.toLowerCase()}`,
          eq(invitations.status, "pending"),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return Boolean(invitation);
  },
};
