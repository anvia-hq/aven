import type { AnyElysia } from "elysia";

export type Edition = {
  name: string;
  manageUrl: string | null;
  features: readonly string[];
  routes: readonly AnyElysia[];
};
