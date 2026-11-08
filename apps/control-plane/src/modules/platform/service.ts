import { db } from "@aven/db/client";
import { threads } from "@aven/db/schema/threads";
import { invitations } from "@aven/db/schema/invitations";
import { githubInstallations } from "@aven/db/schema/github-installations";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { projects } from "@aven/db/schema/projects";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { runtimes } from "@aven/db/schema/runtimes";
import { sessions } from "@aven/db/schema/sessions";
import { users } from "@aven/db/schema/users";
import { and, asc, eq, gt, inArray, max, ne, notInArray, sql } from "drizzle-orm";

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

    await this.refuseWhatOthersUse(person, aloneIn);

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

  async refuseWhatOthersUse(person: { id: string; name: string }, aloneIn: string[]) {
    const [sharedProject] = await db
      .select({ name: projects.name })
      .from(projects)
      .innerJoin(threads, eq(threads.projectId, projects.id))
      .where(
        and(
          eq(projects.createdBy, person.id),
          ne(threads.createdBy, person.id),
          aloneIn.length > 0 ? notInArray(projects.organizationId, aloneIn) : undefined,
        ),
      )
      .limit(1);
    if (sharedProject) {
      throw new ConflictError(
        `${person.name} imported the project ${sharedProject.name}, and other people have threads in it. Archive those threads or have the project imported by someone else first`,
      );
    }

    const owned = db
      .select({ id: runtimes.id })
      .from(runtimes)
      .where(eq(runtimes.ownerId, person.id));
    const [usedProject] = await db
      .select({ runner: runtimes.name })
      .from(projects)
      .innerJoin(runtimes, eq(runtimes.id, projects.runtimeId))
      .where(and(inArray(projects.runtimeId, owned), ne(projects.createdBy, person.id)))
      .limit(1);
    const [usedThread] = await db
      .select({ runner: runtimes.name })
      .from(threads)
      .innerJoin(runtimes, eq(runtimes.id, threads.runtimeId))
      .where(and(inArray(threads.runtimeId, owned), ne(threads.createdBy, person.id)))
      .limit(1);
    const [usedInstallation] = await db
      .select({ account: githubInstallations.accountLogin })
      .from(projects)
      .innerJoin(githubInstallations, eq(githubInstallations.id, projects.githubInstallationId))
      .where(and(eq(githubInstallations.connectedBy, person.id), ne(projects.createdBy, person.id)))
      .limit(1);
    if (usedInstallation) {
      throw new ConflictError(
        `${person.name} connected the GitHub account ${usedInstallation.account}, which other people's projects use. Have someone else connect it and import those projects again first`,
      );
    }
    const used = usedProject ?? usedThread;
    if (used) {
      throw new ConflictError(
        `${person.name} added the runner ${used.runner}, which other people's projects or threads use. Move them to another runner first`,
      );
    }
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
