import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A journal of runs in a directory of its own, as a runner has in production.
export const journalPath = () => join(mkdtempSync(join(tmpdir(), "aven-runner-")), "runs.db");
