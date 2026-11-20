import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { SelectionPlan } from "./types";

export const FULL_RUN_INPUTS: readonly string[] = [
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "tsconfig.check.json",
  "playwright.config.ts",
  ".oxlintrc.json",
  ".oxfmtrc.json",
  ".github/workflows/ci.yml",
  ".github/actions/",
  "packages/db/src/schema/",
  "packages/db/drizzle/",
  "packages/db/src/client.ts",
  "packages/db/src/migrate.ts",
  "packages/protocol/",
  "packages/server-kit/",
  "packages/ui/",
  "apps/platform/vite.config.ts",
  "apps/platform/src/main.tsx",
  "apps/platform/src/routes/__root.tsx",
  "apps/platform/src/modules/navigation/",
  "apps/platform/src/modules/auth/",
  "apps/control-plane/src/index.ts",
  "apps/control-plane/src/app.ts",
  "apps/control-plane/src/errors.ts",
  "apps/control-plane/src/testing/",
  "e2e/helpers.ts",
  "e2e/fake-runner.ts",
  "e2e/fake-model.ts",
  "e2e/fake-github.ts",
  "e2e/bot-runner.ts",
  "e2e/bot-runner-config.ts",
  "e2e/setup-db.ts",
];

const MODULE_E2E_MAP: Record<string, readonly string[]> = {
  actions: ["e2e/actions.spec.ts"],
  announcements: ["e2e/layout.spec.ts"],
  artifacts: ["e2e/artifact-page.spec.ts", "e2e/bots.spec.ts"],
  avatars: ["e2e/avatar.spec.ts"],
  "bot-api": ["e2e/bots.spec.ts", "e2e/bots-peers.spec.ts", "e2e/bots-backend.spec.ts"],
  bots: [
    "e2e/bots.spec.ts",
    "e2e/bots-peers.spec.ts",
    "e2e/bots-settings.spec.ts",
    "e2e/bot-draft.spec.ts",
    "e2e/bots-backend.spec.ts",
    "e2e/artifact-page.spec.ts",
    "e2e/mentions.spec.ts",
  ],
  "cloud-lifecycle": ["e2e/cloud.spec.ts", "e2e/cloud-settings.spec.ts"],
  "cloud-settings": ["e2e/cloud-settings.spec.ts", "e2e/cloud.spec.ts"],
  cockpit: ["e2e/cockpit.spec.ts"],
  computer: ["e2e/machines.spec.ts", "e2e/runtimes.spec.ts"],
  "decision-model": ["e2e/bots-peers.spec.ts"],
  diff: ["e2e/diff.spec.ts"],
  environments: ["e2e/project-page.spec.ts", "e2e/projects.spec.ts"],
  files: ["e2e/files.spec.ts"],
  "follow-ups": ["e2e/follow-ups.spec.ts"],
  github: ["e2e/github.spec.ts"],
  goals: ["e2e/cockpit.spec.ts", "e2e/bots-peers.spec.ts"],
  lens: ["e2e/lens-flag.spec.ts"],
  marks: ["e2e/threads.spec.ts", "e2e/unread-thread.spec.ts"],
  mcp: ["e2e/mcp.spec.ts"],
  "mcp-access": ["e2e/mcp-access.spec.ts"],
  memory: ["e2e/memory.spec.ts", "e2e/new-thread-memory.spec.ts"],
  mentions: ["e2e/mentions.spec.ts"],
  organizations: ["e2e/workspace.spec.ts", "e2e/no-workspace.spec.ts"],
  overview: ["e2e/overview.spec.ts"],
  platform: ["e2e/platform-people.spec.ts"],
  preferences: ["e2e/profile.spec.ts"],
  preview: ["e2e/preview-panel.spec.ts"],
  processes: ["e2e/background-tasks.spec.ts", "e2e/process-note.spec.ts"],
  profile: ["e2e/profile.spec.ts"],
  projects: ["e2e/projects.spec.ts", "e2e/project-page.spec.ts", "e2e/add-folder.spec.ts"],
  providers: ["e2e/providers.spec.ts", "e2e/secret.spec.ts"],
  runs: [
    "e2e/threads.spec.ts",
    "e2e/thread-running.spec.ts",
    "e2e/steer.spec.ts",
    "e2e/question.spec.ts",
    "e2e/compact.spec.ts",
    "e2e/subagents.spec.ts",
    "e2e/working-under-response.spec.ts",
    "e2e/control-plane-agent.spec.ts",
  ],
  runtimes: ["e2e/runtimes.spec.ts", "e2e/machines.spec.ts", "e2e/cloud.spec.ts"],
  schedules: ["e2e/bots-peers.spec.ts"],
  "server-models": ["e2e/providers.spec.ts"],
  settings: ["e2e/workspace.spec.ts", "e2e/profile.spec.ts", "e2e/cloud-settings.spec.ts"],
  ship: ["e2e/ship.spec.ts"],
  skills: ["e2e/threads.spec.ts"],
  terminal: ["e2e/terminal.spec.ts"],
  theme: ["e2e/themes.spec.ts"],
  "thread-events": ["e2e/threads.spec.ts", "e2e/thread-running.spec.ts"],
  "thread-watch": ["e2e/threads.spec.ts", "e2e/unread-thread.spec.ts"],
  threads: [
    "e2e/threads.spec.ts",
    "e2e/composer.spec.ts",
    "e2e/continue-thread.spec.ts",
    "e2e/fork-rows.spec.ts",
    "e2e/rename-thread.spec.ts",
    "e2e/sharing.spec.ts",
    "e2e/split-threads.spec.ts",
    "e2e/thread-draft.spec.ts",
    "e2e/thread-messages-limit.spec.ts",
    "e2e/thread-panels.spec.ts",
    "e2e/thread-running.spec.ts",
    "e2e/unread-thread.spec.ts",
    "e2e/working-under-response.spec.ts",
  ],
  users: ["e2e/platform-people.spec.ts", "e2e/profile.spec.ts"],
  variables: ["e2e/variables.spec.ts"],
  webhooks: ["e2e/webhooks.spec.ts"],
  "workload-identity": ["e2e/secret.spec.ts"],
};

const DOCS_OR_NATIVE_PREFIXES = ["docs/", "clients/", "apps/macos/", "deploy/", ".aven/"];

const DOCS_EXACT = new Set([
  "README.md",
  "AGENTS.md",
  "LICENSE",
  "CONTRIBUTING.md",
  ".env.example",
]);

function matchesFullInput(file: string): boolean {
  if (/(?:^|\/)tsconfig[^/]*\.json$/.test(file)) return true;

  return FULL_RUN_INPUTS.some((entry) =>
    entry.endsWith("/") ? file.startsWith(entry) : file === entry,
  );
}

function isDocOrNativeOnly(file: string): boolean {
  return DOCS_EXACT.has(file) || DOCS_OR_NATIVE_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function moduleOf(file: string): string | null {
  const match = /^apps\/(?:platform|control-plane)\/src\/modules\/([^/]+)\//.exec(file);
  return match ? match[1]! : null;
}

export function selectTests(
  changedFiles: readonly string[],
  cwd: string = process.cwd(),
): SelectionPlan {
  if (changedFiles.length === 0) {
    return {
      fullUnit: false,
      fullE2e: false,
      reason: "no changed files",
      unitFiles: [],
      e2eSpecs: [],
      useBunChanged: false,
    };
  }

  for (const file of changedFiles) {
    if (matchesFullInput(file)) {
      return {
        fullUnit: true,
        fullE2e: true,
        reason: `global input changed: ${file}`,
        unitFiles: [],
        e2eSpecs: [],
        useBunChanged: false,
      };
    }
  }

  const e2eSpecs = new Set<string>();
  const explicitUnitFiles = new Set<string>();
  let fullUnit = false;
  let fullE2e = false;
  let useBunChanged = false;
  let reason = "narrow diff selection";

  for (const file of changedFiles) {
    if (file.startsWith("docs/decision/")) {
      explicitUnitFiles.add("tooling/docs/decision-folder.test.mjs");
      continue;
    }

    if (
      isDocOrNativeOnly(file) ||
      file.startsWith(".github/workflows/dco") ||
      file.startsWith(".github/workflows/hammer") ||
      file.startsWith(".github/workflows/release")
    ) {
      continue;
    }

    if (file.startsWith("e2e/") && file.endsWith(".spec.ts")) {
      if (existsSync(resolve(cwd, file))) e2eSpecs.add(file);

      continue;
    }

    if (file.startsWith("tooling/")) {
      useBunChanged = true;
      continue;
    }

    if (file.startsWith("apps/cli/")) {
      useBunChanged = true;
      continue;
    }

    if (file.startsWith("packages/claude/")) {
      useBunChanged = true;
      e2eSpecs.add("e2e/claude-backend.spec.ts");
      e2eSpecs.add("e2e/claude-flag.spec.ts");
      continue;
    }

    if (file.startsWith("packages/codex/")) {
      useBunChanged = true;
      e2eSpecs.add("e2e/codex-backend.spec.ts");
      e2eSpecs.add("e2e/codex-flag.spec.ts");
      continue;
    }

    if (file.startsWith("sandbox/")) {
      useBunChanged = true;
      e2eSpecs.add("e2e/cloud.spec.ts");
      e2eSpecs.add("e2e/cloud-settings.spec.ts");
      continue;
    }

    const mod = moduleOf(file);

    if (mod && MODULE_E2E_MAP[mod]) {
      useBunChanged = true;
      for (const spec of MODULE_E2E_MAP[mod]!) e2eSpecs.add(spec);
      continue;
    }

    fullUnit = true;
    fullE2e = true;
    reason = `unmapped shared file changed: ${file}`;
    break;
  }

  return {
    fullUnit,
    fullE2e,
    reason,
    unitFiles: [...explicitUnitFiles].sort(),
    e2eSpecs: fullE2e ? [] : [...e2eSpecs].sort(),
    useBunChanged: !fullUnit && useBunChanged,
  };
}

if (import.meta.main) {
  let baseRef = "origin/main";
  let githubOutput: string | undefined;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--base=")) baseRef = arg.slice("--base=".length);
    else if (arg.startsWith("--github-output="))
      githubOutput = arg.slice("--github-output=".length);
  }

  const diff = Bun.spawnSync(["git", "diff", "--name-only", `${baseRef}...HEAD`], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (diff.exitCode !== 0) {
    console.error(`git diff failed against ${baseRef}: ${diff.stderr.toString()}`);
    process.exit(1);
  }

  const changed = diff.stdout
    .toString()
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.trim();
      return trimmed ? [trimmed] : [];
    });

  const plan = selectTests(changed);
  console.log(JSON.stringify({ baseRef, changedCount: changed.length, ...plan }, null, 2));

  if (githubOutput) {
    const lines = [
      `full_unit=${plan.fullUnit}`,
      `full_e2e=${plan.fullE2e}`,
      `use_bun_changed=${plan.useBunChanged}`,
      `unit_files=${plan.unitFiles.join(",")}`,
      `e2e_specs=${plan.e2eSpecs.join(",")}`,
      `reason=${plan.reason}`,
    ];
    await Bun.write(githubOutput, `${lines.join("\n")}\n`);
  }
}
