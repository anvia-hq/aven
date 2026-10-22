import { atom } from "jotai";

import type { Message, Thread, ToolCall } from "../types";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const tool = (
  call: Omit<ToolCall, "status"> & { status?: ToolCall["status"] },
): Message["parts"][number] => ({
  type: "tool",
  tool: { status: "done", ...call },
});

const seed: Thread[] = [
  {
    id: "t-rate-limit",
    projectId: "p-aven",
    state: "open",
    title: "Add rate limiting to the API",
    repo: "aven",
    branch: "feat/rate-limit",
    mode: "smart",
    status: "idle",
    contextUsed: 23,
    updatedAt: minutesAgo(12),
    messages: [
      {
        id: "m1",
        role: "user",
        createdAt: minutesAgo(15),
        parts: [
          {
            type: "text",
            text: "Add rate limiting to the control-plane API. 60 requests per minute per IP, stricter on /auth/*.",
          },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        createdAt: minutesAgo(14),
        parts: [
          {
            type: "text",
            text: "I'll look at how the app is wired first, then add a small in-memory limiter as an Elysia plugin.",
          },
          tool({ id: "c1", name: "read", target: "apps/control-plane/src/index.ts" }),
          tool({
            id: "c2",
            name: "search",
            target: "derive|macro in apps/control-plane",
            output: "3 matches in 2 files",
          }),
          {
            type: "text",
            text: "The app mounts routers in `index.ts`, so a plugin with `onBeforeHandle` fits. Creating the limiter module now.",
          },
          tool({
            id: "c3",
            name: "edit",
            target: "apps/control-plane/src/modules/rate-limit/service.ts",
            diff: [
              {
                type: "add",
                text: "const hits = new Map<string, { count: number; resetAt: number }>();",
              },
              { type: "add", text: "" },
              { type: "add", text: "export const rateLimitService = {" },
              { type: "add", text: "  hit(key: string, limit: number, windowMs = 60_000) {" },
              { type: "add", text: "    const now = Date.now();" },
              { type: "add", text: "    const entry = hits.get(key);" },
              { type: "add", text: "    if (!entry || entry.resetAt < now) {" },
              { type: "add", text: "      hits.set(key, { count: 1, resetAt: now + windowMs });" },
              { type: "add", text: "      return { allowed: true, remaining: limit - 1 };" },
              { type: "add", text: "    }" },
              { type: "add", text: "    entry.count += 1;" },
              {
                type: "add",
                text: "    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };",
              },
              { type: "add", text: "  }," },
              { type: "add", text: "};" },
            ],
          }),
          tool({
            id: "c4",
            name: "edit",
            target: "apps/control-plane/src/index.ts",
            diff: [
              { type: "ctx", text: "const app = new Elysia()" },
              { type: "ctx", text: '  .get("/health", () => ({ status: "ok" }))' },
              { type: "add", text: "  .use(rateLimitRouter)" },
              { type: "ctx", text: "  .use(authRouter)" },
            ],
          }),
          tool({
            id: "c5",
            name: "bash",
            target: "bun run typecheck",
            output: "@aven/control-plane typecheck: Exited with code 0",
          }),
          {
            type: "text",
            text: "Done. Requests are limited to **60/min per IP**, and `/auth/*` is capped at **10/min**. Typecheck passes. I haven't added tests yet.",
          },
        ],
      },
    ],
  },
  {
    id: "t-flaky-e2e",
    projectId: "p-aven",
    state: "open",
    title: "Fix flaky sign-out e2e test",
    repo: "aven",
    branch: "fix/e2e-signout",
    mode: "rush",
    status: "idle",
    contextUsed: 9,
    updatedAt: minutesAgo(95),
    messages: [
      {
        id: "m1",
        role: "user",
        createdAt: minutesAgo(100),
        parts: [
          {
            type: "text",
            text: "The sign out e2e test fails about 1 in 10 runs. Can you find out why?",
          },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        createdAt: minutesAgo(98),
        parts: [
          tool({ id: "c1", name: "read", target: "e2e/auth-ui.spec.ts" }),
          tool({
            id: "c2",
            name: "bash",
            target: "bun run test:e2e --repeat-each=10",
            output: "9 passed, 1 failed (sign out)",
          }),
          {
            type: "text",
            text: "The popover animates open, so the click on **Sign out** can land mid-animation. Waiting for the menu item to be stable fixes it.",
          },
        ],
      },
    ],
  },
  {
    id: "t-uuid",
    projectId: "p-aven",
    state: "open",
    title: "Migrate users table to uuid ids",
    repo: "aven",
    branch: "main",
    mode: "smart",
    status: "idle",
    contextUsed: 41,
    updatedAt: minutesAgo(60 * 26),
    messages: [
      {
        id: "m1",
        role: "user",
        createdAt: minutesAgo(60 * 26),
        parts: [
          { type: "text", text: "What would it take to move Better Auth to uuid primary keys?" },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        createdAt: minutesAgo(60 * 26),
        parts: [
          tool({ id: "c1", name: "read", target: "packages/db/src/schema/users.ts" }),
          {
            type: "text",
            text: "Better Auth can generate uuids with `advanced.database.generateId`. You'd change the four id columns plus the two foreign keys, then regenerate the migration. It's a breaking change for existing rows, so it's best done before real users exist.",
          },
        ],
      },
    ],
  },
  {
    id: "t-docs-search",
    projectId: "p-docs",
    state: "open",
    title: "Add search to the docs site",
    repo: "docs-site",
    branch: "feat/search",
    mode: "smart",
    status: "idle",
    contextUsed: 17,
    updatedAt: minutesAgo(60 * 50),
    messages: [
      {
        id: "m1",
        role: "user",
        createdAt: minutesAgo(60 * 50),
        parts: [
          { type: "text", text: "Can we add client-side search to the docs? Keep it lightweight." },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        createdAt: minutesAgo(60 * 50),
        parts: [
          tool({
            id: "c1",
            name: "search",
            target: "search|algolia in docs-site",
            output: "0 matches",
          }),
          {
            type: "text",
            text: "Nothing exists yet. I'd build a static index at build time and query it with **MiniSearch**; it adds ~7kB gzipped.",
          },
        ],
      },
    ],
  },
  {
    id: "t-mobile-crash",
    projectId: "p-mobile",
    state: "open",
    title: "Fix crash on cold start",
    repo: "mobile-app",
    branch: "fix/cold-start",
    mode: "rush",
    status: "idle",
    contextUsed: 12,
    updatedAt: minutesAgo(60 * 70),
    messages: [
      {
        id: "m1",
        role: "user",
        createdAt: minutesAgo(60 * 70),
        parts: [
          {
            type: "text",
            text: "The app crashes on Android cold start. Stack trace points at `useSession`.",
          },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        createdAt: minutesAgo(60 * 70),
        parts: [
          tool({ id: "c1", name: "read", target: "src/hooks/use-session.ts" }),
          {
            type: "text",
            text: "The hook reads secure storage before the native module is ready. Awaiting `SecureStore.isAvailableAsync()` first fixes it.",
          },
          tool({
            id: "c2",
            name: "edit",
            target: "src/hooks/use-session.ts",
            diff: [
              { type: "ctx", text: "export function useSession() {" },
              { type: "add", text: "  const ready = useSecureStoreReady();" },
              { type: "del", text: "  const token = SecureStore.getItem(KEY);" },
              { type: "add", text: "  const token = ready ? SecureStore.getItem(KEY) : null;" },
            ],
          }),
        ],
      },
    ],
  },
  {
    id: "t-old-ci",
    projectId: "p-aven",
    state: "archived",
    title: "Set up GitHub Actions for typecheck",
    repo: "aven",
    branch: "chore/ci",
    mode: "rush",
    status: "idle",
    contextUsed: 8,
    updatedAt: minutesAgo(60 * 24 * 5),
    messages: [
      {
        id: "m1",
        role: "user",
        createdAt: minutesAgo(60 * 24 * 5),
        parts: [
          { type: "text", text: "Add a CI workflow that runs typecheck and lint on every PR." },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        createdAt: minutesAgo(60 * 24 * 5),
        parts: [
          tool({
            id: "c1",
            name: "edit",
            target: ".github/workflows/ci.yml",
            diff: [
              { type: "add", text: "name: ci" },
              { type: "add", text: "on: [pull_request]" },
              { type: "add", text: "jobs:" },
              { type: "add", text: "  check:" },
              { type: "add", text: "    runs-on: ubuntu-latest" },
              {
                type: "add",
                text: "    steps: [{ uses: actions/checkout@v4 }, { run: bun run typecheck }]",
              },
            ],
          }),
          {
            type: "text",
            text: "Added `.github/workflows/ci.yml`. It runs on every pull request.",
          },
        ],
      },
    ],
  },
  {
    id: "t-snoozed",
    projectId: "p-docs",
    state: "snoozed",
    title: "Rewrite the getting started guide",
    repo: "docs-site",
    branch: "docs/getting-started",
    mode: "smart",
    status: "idle",
    contextUsed: 5,
    updatedAt: minutesAgo(60 * 24 * 2),
    messages: [
      {
        id: "m1",
        role: "user",
        createdAt: minutesAgo(60 * 24 * 2),
        parts: [
          {
            type: "text",
            text: "Rewrite the getting started guide for the new CLI. I'll come back to this next week.",
          },
        ],
      },
    ],
  },
];

export const threadsAtom = atom<Thread[]>(seed);
