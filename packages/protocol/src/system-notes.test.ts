import { expect, test } from "bun:test";

import { systemNoteOf } from "./system-notes";

test("a process or fork note is its first line, and an ordinary message is not a note", () => {
  expect(
    systemNoteOf(
      "[process] Process p1 (bun test) ended with exit code 0 after 3s.\nYou started it...\n<process_output>\nok\n</process_output>",
    ),
  ).toEqual({ kind: "process", line: "Process p1 (bun test) ended with exit code 0 after 3s." });
  expect(systemNoteOf('[fork] Your fork "A" (x) is done.')).toEqual({
    kind: "fork",
    line: 'Your fork "A" (x) is done.',
  });
  expect(systemNoteOf('[continued] Continued from "A", now on box\n\nYou continue...')).toEqual({
    kind: "continued",
    line: 'Continued from "A", now on box',
  });
  expect(systemNoteOf("please fix the [process] docs")).toBeNull();
  expect(systemNoteOf("[from main] hi")).toBeNull();
});
