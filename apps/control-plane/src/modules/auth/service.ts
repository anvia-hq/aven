import { db } from "@aven/db/client";
import { accounts } from "@aven/db/schema/accounts";
import { sessions } from "@aven/db/schema/sessions";
import { users } from "@aven/db/schema/users";
import { verifications } from "@aven/db/schema/verifications";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");

// The backend is reached through the platform's `/api` proxy, which strips the prefix,
// so Better Auth lives at `/auth` here and `/api/auth` in the browser.
export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
  basePath: "/auth",
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "http://localhost:5173").split(","),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  emailAndPassword: { enabled: true },
});

export const authService = {
  getSession: (headers: Headers) => auth.api.getSession({ headers }),
};
