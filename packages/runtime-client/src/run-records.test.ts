import { expect, test } from "bun:test";
import { statSync } from "node:fs";

import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords, type RunRecord } from "./run-records";
import { journalPath } from "./testing/journal-path";

const record: RunRecord = {
  runId: "run-1",
  thread: { id: "thread-1", organizationId: "org-1" },
  kind: "start",
  prompt: "go",
  agentId: "run-run-1",
  turn: 0,
};

test("records survive the process, and are replaced as a run progresses", () => {
  const path = journalPath();
  const before = new RunRecords(openRunDatabase(path));
  before.save(record);
  before.save({ ...record, durableId: "d-1", turn: 2 });

  const after = new RunRecords(openRunDatabase(path));
  expect(after.all()).toEqual([{ ...record, durableId: "d-1", turn: 2 }]);
  expect(after.get("run-1")?.durableId).toBe("d-1");
  after.delete("run-1");
  expect(after.get("run-1")).toBeUndefined();
});

test("records and the outbox can share a database file", () => {
  const db = openRunDatabase(journalPath());
  const records = new RunRecords(db);
  const outbox = new RunOutbox(db);
  records.save(record);
  outbox.open("run-1");
  expect(records.all()).toHaveLength(1);
  expect(outbox.ids()).toEqual(["run-1"]);
});

test("the state file is readable by its owner only, since it holds model grants", () => {
  const path = journalPath();
  openRunDatabase(path);
  expect(statSync(path).mode & 0o777).toBe(0o600);
});
