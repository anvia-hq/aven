import { db } from "@aven/db/client";
import { accounts } from "@aven/db/schema/accounts";
import { invitations } from "@aven/db/schema/invitations";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { sessions } from "@aven/db/schema/sessions";
import { users } from "@aven/db/schema/users";
import { verifications } from "@aven/db/schema/verifications";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { bearer, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { platformService } from "../platform/service";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");

export async function ensurePersonalOrganization(userId: string) {
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  if (!user) throw new Error(`Cannot create an organization: user ${userId} does not exist`);
  const organizationId = `personal-${userId}`;
  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: organizationId, name: `${user.name}'s organization`, slug: organizationId })
      .onConflictDoNothing();
    await tx
      .insert(members)
      .values({ id: crypto.randomUUID(), organizationId, userId, role: "owner" })
      .onConflictDoNothing();
  });
  return organizationId;
}

export const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "http://localhost:5173").split(",");

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
  basePath: "/auth",
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      organization: organizations,
      member: members,
      invitation: invitations,
    },
  }),
  emailAndPassword: { enabled: true },
  plugins: [organization(), bearer()],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(await platformService.canRegister(user.email))) {
            throw new APIError("FORBIDDEN", { message: "Registration is closed" });
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await ensurePersonalOrganization(session.userId),
          },
        }),
      },
    },
  },
});

export const authService = {
  getSession: (headers: Headers) => auth.api.getSession({ headers }),
};
