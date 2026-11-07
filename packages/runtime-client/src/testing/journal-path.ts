import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const journalPath = () => join(mkdtempSync(join(tmpdir(), "aven-runner-")), "runs.db");
