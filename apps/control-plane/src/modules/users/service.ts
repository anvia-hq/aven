import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import type { CreateUserBody, UpdateUserBody } from "./schema";

export const usersService = {
  list: () => db.select().from(users),

  get: async (id: string) => {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  },

  create: async (body: CreateUserBody) => {
    const [user] = await db.insert(users).values(body).returning();
    return user!;
  },

  update: async (id: string, body: UpdateUserBody) => {
    const [user] = await db.update(users).set(body).where(eq(users.id, id)).returning();
    return user ?? null;
  },
};
