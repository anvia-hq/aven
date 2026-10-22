import { atom } from "jotai";

import type { Integration } from "../types";

export const integrationsAtom = atom<Integration[]>([
  {
    id: "github",
    name: "GitHub",
    description: "Read repos, open pull requests and review diffs.",
    icon: "github",
    connected: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Start threads and get notified when the agent finishes.",
    icon: "slack",
    connected: false,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Link threads to issues and update their status.",
    icon: "linear",
    connected: false,
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Pull stack traces into a thread automatically.",
    icon: "sentry",
    connected: true,
  },
  {
    id: "postgres",
    name: "Postgres (MCP)",
    description: "Let the agent inspect your schema and run read-only queries.",
    icon: "postgres",
    connected: false,
  },
  {
    id: "browser",
    name: "Browser (MCP)",
    description: "Open pages and take screenshots to verify UI changes.",
    icon: "browser",
    connected: false,
  },
]);
