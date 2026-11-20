import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Database } from "./types";

export function createDatabase(url: string): Database {
  const sql = postgres(url);
  return { sql, db: drizzle(sql) };
}

let cached: Database | null = null;

function defaultDatabase(): Database {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;

  if (!url) throw new Error("DATABASE_URL is not set");

  cached = createDatabase(url);
  return cached;
}

function lazyObject<T extends object>(resolve: () => T): T {
  return new Proxy(Object.create(null) as T, {
    get(_, property) {
      const target = resolve();
      const value: unknown = target[property as keyof T];
      return typeof value === "function" ? value.bind(target) : value;
    },
    has(_, property) {
      return property in resolve();
    },
    getPrototypeOf() {
      return Object.getPrototypeOf(resolve());
    },
  });
}

function lazyCallable<T extends (...args: never[]) => unknown>(resolve: () => T): T {
  const placeholder = Object.setPrototypeOf(() => undefined, null) as T;
  return new Proxy(placeholder, {
    apply(_, thisArg, args) {
      return Function.prototype.apply.call(resolve(), thisArg, args);
    },
    get(_, property) {
      const target = resolve();
      const value: unknown = target[property as keyof T];
      return typeof value === "function" ? value.bind(target) : value;
    },
    has(_, property) {
      return property in resolve();
    },
    getPrototypeOf() {
      return Object.getPrototypeOf(resolve());
    },
  });
}

export const sql: Database["sql"] = lazyCallable(() => defaultDatabase().sql);
export const db: Database["db"] = lazyObject(() => defaultDatabase().db);
