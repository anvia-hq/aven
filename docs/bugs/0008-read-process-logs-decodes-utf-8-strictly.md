# `read_process_logs` fails on output that is not whole UTF-8

Status: worked around in `packages/runtime-client/src/valid-utf8.ts`; found on 2026-11-18 in a thread's run with `@anvia/sandbox` 1.3.2.

## Symptom

The agent's `read_process_logs` call failed with `ToolCallError: The encoded data was not valid for encoding utf-8` on two runs of Playwright, and the agent lost steps working out why its test failed.

## Cause

The tool asks the sandbox for the last `tailBytes` bytes of a process's output and decodes them with a fatal `TextDecoder`. A byte tail can start inside a multi-byte character, and test runners print bytes that are not UTF-8 at all, so the decode throws instead of returning text.

## Workaround

`DirectorySandbox.readProcessLogs` and `RemoteSandbox.readProcessLogs` hand back valid UTF-8: they drop the continuation bytes a cut leaves at the start and replace every other invalid byte with U+FFFD. Doing it in `RemoteSandbox` as well fixes a thread whose runner has not been updated.

## When to remove it

When `@anvia/sandbox` decodes process logs without `fatal`, or cuts the tail on a character boundary.
