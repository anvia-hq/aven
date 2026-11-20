import { SQL } from "bun";

const DB_PREFIXES = ["apps/control-plane/", "packages/db/"];
const DEFAULT_DB_URL = "postgres://postgres:postgres@localhost:5432/aven_prepush_template";
const TEMPLATE_DB = "aven_prepush_template";

export function needsDatabase(changedFiles: readonly string[]): boolean {
  return changedFiles.some((file) => DB_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

function listChangedFiles(baseRef: string): { ref: string; files: string[] } {
  const candidates = [baseRef, "main", "HEAD~1"];
  for (const ref of candidates) {
    const result = Bun.spawnSync(["git", "diff", "--name-only", `${ref}...HEAD`], {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (result.exitCode === 0) {
      const files = result.stdout
        .toString()
        .split("\n")
        .flatMap((line) => {
          const trimmed = line.trim();
          return trimmed ? [trimmed] : [];
        });
      return { ref, files };
    }
  }

  console.error(`pre-push: git diff failed against ${candidates.join(", ")}`);
  process.exit(1);
}

async function prepareTemplateDatabase(baseUrl: string): Promise<string | null> {
  const templateUrl = new URL(baseUrl);
  templateUrl.pathname = `/${TEMPLATE_DB}`;
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/postgres";

  const admin = new SQL(adminUrl.toString());
  try {
    await admin.unsafe("SELECT 1");
    const rows = await admin.unsafe(`SELECT 1 FROM pg_database WHERE datname = '${TEMPLATE_DB}'`);

    if (rows.length === 0) {
      await admin.unsafe(`CREATE DATABASE ${TEMPLATE_DB}`);
    }
  } catch {
    return null;
  } finally {
    await admin.close();
  }

  const migrate = Bun.spawnSync(["bun", "packages/db/src/migrate.ts"], {
    env: { ...process.env, DATABASE_URL: templateUrl.toString() },
    stdout: "inherit",
    stderr: "inherit",
  });

  if (migrate.exitCode !== 0) {
    process.exit(migrate.exitCode);
  }

  return templateUrl.toString();
}

if (import.meta.main) {
  const requestedBase = process.env.AVEN_PREPUSH_BASE ?? "origin/main";
  const { ref: baseRef, files: changed } = listChangedFiles(requestedBase);

  if (changed.length === 0) {
    process.exit(0);
  }

  if (!needsDatabase(changed)) {
    const run = Bun.spawnSync(
      [
        "bun",
        "test",
        "--changed",
        baseRef,
        "--pass-with-no-tests",
        "apps",
        "packages",
        "sandbox",
        "tooling",
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    process.exit(run.exitCode);
  }

  const baseUrl = process.env.DATABASE_URL ?? DEFAULT_DB_URL;
  const templateUrl = await prepareTemplateDatabase(baseUrl);

  if (!templateUrl) {
    console.warn(
      "pre-push: Postgres is not reachable locally; running non-DB changed unit tests only (CI will run DB tests).",
    );
    const run = Bun.spawnSync(
      [
        "bun",
        "test",
        "--changed",
        baseRef,
        "--pass-with-no-tests",
        "apps/cli",
        "apps/platform",
        "apps/runtime",
        "packages/agent-backend",
        "packages/agents",
        "packages/claude",
        "packages/codex",
        "packages/github",
        "packages/protocol",
        "packages/runtime-client",
        "packages/server-kit",
        "packages/ui",
        "sandbox",
        "tooling",
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    process.exit(run.exitCode);
  }

  const run = Bun.spawnSync(
    [
      "bun",
      "test",
      "--parallel=4",
      "--isolate",
      "--preload",
      "./tooling/ci/test-db-preload.ts",
      "--changed",
      baseRef,
      "--pass-with-no-tests",
      "apps",
      "packages",
      "sandbox",
      "tooling",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: templateUrl,
        AVEN_TEST_DB_TEMPLATE: TEMPLATE_DB,
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  process.exit(run.exitCode);
}
