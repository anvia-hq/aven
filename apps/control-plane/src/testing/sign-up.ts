import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { auth, authService } from "../modules/auth/service";

const authUrl = () => process.env.BETTER_AUTH_URL ?? "http://localhost:5173";

export async function signUp(name: string) {
  const email = `${name}-${crypto.randomUUID().slice(0, 8)}@aven.test`;
  const post = (path: string, body: object) =>
    auth.handler(
      new Request(`${authUrl()}/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  await post("sign-up/email", { name, email, password: "password123" });
  const signIn = await post("sign-in/email", { email, password: "password123" });
  const token = signIn.headers.get("set-auth-token")!;
  const session = await authService.getSession(new Headers({ authorization: `Bearer ${token}` }));
  const organizationId = session!.session.activeOrganizationId!;
  return {
    email,
    token,
    userId: session!.user.id,
    organizationId,
    remove: async () => {
      await db.delete(users).where(eq(users.email, email));
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    },
  };
}

export async function joinOrganization(
  person: { token: string; userId: string },
  organizationId: string,
  role: "member" | "admin",
) {
  await db.insert(members).values({
    id: `m-${person.userId}-${organizationId}`,
    organizationId,
    userId: person.userId,
    role,
  });
  const switched = await auth.handler(
    new Request(`${authUrl()}/auth/organization/set-active`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${person.token}` },
      body: JSON.stringify({ organizationId }),
    }),
  );

  if (!switched.ok) throw new Error(`Could not make ${organizationId} active`);
}
