import { db } from "@aven/db/client";
import { invitations } from "@aven/db/schema/invitations";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { users } from "@aven/db/schema/users";
import { and, asc, eq, gt, sql } from "drizzle-orm";

const REGISTRATION_KEY = "registration_enabled";

// Platform owners are listed in PLATFORM_OWNER_EMAILS (comma separated).
function ownerEmails() {
  return (process.env.PLATFORM_OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

const isListedOwner = (email: string) => ownerEmails().includes(email.toLowerCase());

// The first account made on an installation is its platform owner, with nothing to configure. It is
// read from the accounts, not stored, so an installation that already has people needs no backfill
// and two sign-ups at once cannot both claim it (decision 0077).
async function firstUserId() {
  const [first] = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return first?.id;
}

export const platformService = {
  /** The first account, or anyone listed in PLATFORM_OWNER_EMAILS. */
  async isOwner(person: { id: string; email: string }) {
    return isListedOwner(person.email) || (await firstUserId()) === person.id;
  },

  // Registration is open until an owner closes it.
  async isRegistrationEnabled() {
    const [row] = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, REGISTRATION_KEY));
    return row?.value !== "false";
  },

  async setRegistrationEnabled(enabled: boolean) {
    const value = String(enabled);
    await db
      .insert(platformSettings)
      .values({ key: REGISTRATION_KEY, value })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value } });
  },

  // Closed registration still admits owners and people holding a pending, unexpired invitation.
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
