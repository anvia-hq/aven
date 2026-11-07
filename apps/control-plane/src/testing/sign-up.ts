import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { auth, authService } from "../modules/auth/service";

export async function signUp(name: string) {
  const email = `${name}-${crypto.randomUUID().slice(0, 8)}@aven.test`;
  const url = process.env.BETTER_AUTH_URL ?? "http://localhost:5173";
  const post = (path: string, body: object) =>
    auth.handler(
      new Request(`${url}/auth/${path}`, {
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
    token,
    userId: session!.user.id,
    organizationId,
    remove: async () => {
      await db.delete(users).where(eq(users.email, email));
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    },
  };
}
