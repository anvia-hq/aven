import { atom } from "jotai";

import type { Commit, FileEntry, Project } from "../types";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const commit = (
  hash: string,
  message: string,
  author: string,
  hours: number,
  ci: Commit["ci"] = null,
): Commit => ({ hash, message, author, at: hoursAgo(hours), ci });

const entry = (
  name: string,
  type: FileEntry["type"],
  message: string,
  hours: number,
): FileEntry => ({
  name,
  type,
  message,
  at: hoursAgo(hours),
});

export const projectsAtom = atom<Project[]>([
  {
    id: "p-aven",
    name: "aven",
    repo: "indrazm/aven",
    description: "Monorepo for the Aven platform and control-plane.",
    language: "TypeScript",
    defaultBranch: "main",
    status: "active",
    createdAt: daysAgo(60),
    updatedAt: daysAgo(0),
    commits: [
      commit("3f9a1c2", "feat(threads): add mock agent UI", "indrazm", 3, "pass"),
      commit("81bd0e7", "feat(settings): members, API keys and usage pages", "indrazm", 9, "pass"),
      commit("c07e5aa", "chore(ui): switch icons to Mynaui", "indrazm", 26, "pass"),
      commit("5a31f79", "feat: add packages/db and control-plane", "sari", 48, "fail"),
      commit("f7a58ad", "feat: add apps/platform and structure rules", "indrazm", 52, "pass"),
    ],
    files: [
      entry("apps", "dir", "feat(threads): add mock agent UI", 3),
      entry("docs", "dir", "docs: add threads mock UI product doc", 3),
      entry("e2e", "dir", "test(e2e): cover threads and settings", 3),
      entry("packages", "dir", "feat: add packages/db and control-plane", 48),
      entry("tooling", "dir", "feat(lint): no-native-primitives rule", 30),
      entry(".env.example", "file", "feat(auth): add Better Auth env", 40),
      entry(".gitignore", "file", "test: ignore playwright output", 40),
      entry(".oxlintrc.json", "file", "chore(lint): ignore vendored components", 30),
      entry("AGENTS.md", "file", "docs: document icons and theme rules", 6),
      entry("docker-compose.yml", "file", "feat: postgres on 54329", 40),
      entry("package.json", "file", "chore: add test:e2e script", 40),
      entry("playwright.config.ts", "file", "test(e2e): separate ports and db", 40),
    ],
  },
  {
    id: "p-docs",
    name: "docs-site",
    repo: "indrazm/docs-site",
    description: "Public documentation site built with MDX.",
    language: "MDX",
    defaultBranch: "main",
    status: "active",
    createdAt: daysAgo(120),
    updatedAt: daysAgo(2),
    commits: [
      commit("9be41d0", "feat(search): add MiniSearch index", "indrazm", 20, "pass"),
      commit("a77c3e1", "docs: refresh CLI reference", "budi", 60, "pass"),
      commit("0d2f9b8", "fix(mdx): broken code fence in guide", "sari", 130, "fail"),
    ],
    files: [
      entry("content", "dir", "docs: refresh CLI reference", 60),
      entry("public", "dir", "chore: compress images", 300),
      entry("src", "dir", "feat(search): add MiniSearch index", 20),
      entry("package.json", "file", "chore: bump mdx", 200),
      entry("README.md", "file", "docs: update contributing section", 500),
    ],
  },
  {
    id: "p-mobile",
    name: "mobile-app",
    repo: "indrazm/mobile-app",
    description: "React Native client for iOS and Android.",
    language: "TypeScript",
    defaultBranch: "develop",
    status: "active",
    createdAt: daysAgo(200),
    updatedAt: daysAgo(5),
    commits: [
      commit("e12a77f", "fix(session): wait for secure store on cold start", "indrazm", 70, "pass"),
      commit("b90c4d2", "feat(onboarding): new welcome screen", "maya", 140, "pass"),
    ],
    files: [
      entry("android", "dir", "chore: update gradle", 300),
      entry("ios", "dir", "chore: update pods", 300),
      entry("src", "dir", "fix(session): wait for secure store on cold start", 70),
      entry("app.json", "file", "chore: bump version", 140),
      entry("package.json", "file", "chore: bump deps", 140),
    ],
  },
  {
    id: "p-infra",
    name: "infra",
    repo: "indrazm/infra",
    description: "Terraform modules for the old hosting setup.",
    language: "HCL",
    defaultBranch: "main",
    status: "archived",
    createdAt: daysAgo(400),
    updatedAt: daysAgo(90),
    commits: [commit("1a2b3c4", "chore: archive repository", "indrazm", 2160)],
    files: [
      entry("modules", "dir", "initial import", 9000),
      entry("main.tf", "file", "chore: archive repository", 2160),
    ],
  },
]);
