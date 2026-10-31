import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

const columns = {
  id: users.id,
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
};

export const usersService = {
  get: async (id: string) => {
    const [user] = await db.select(columns).from(users).where(eq(users.id, id));
    return user ?? null;
  },
};
