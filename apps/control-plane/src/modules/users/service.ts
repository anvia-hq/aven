import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { desc, eq } from "drizzle-orm";

import type { UpdateUserBody } from "./schema";

const columns = {
  id: users.id,
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
};

export const usersService = {
  list: () => db.select(columns).from(users).orderBy(desc(users.createdAt)),

  get: async (id: string) => {
    const [user] = await db.select(columns).from(users).where(eq(users.id, id));
    return user ?? null;
  },

  update: async (id: string, body: UpdateUserBody) => {
    const [user] = await db.update(users).set(body).where(eq(users.id, id)).returning(columns);
    return user ?? null;
  },
};
