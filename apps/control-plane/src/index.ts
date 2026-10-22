import { Elysia } from "elysia";

import { usersRouter } from "./modules/users/router";

const app = new Elysia().get("/health", () => ({ status: "ok" })).use(usersRouter);

app.listen(process.env.PORT ?? 8000);

console.log(`control-plane listening on ${app.server?.url}`);

export type App = typeof app;
