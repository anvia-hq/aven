const MACHINE_CALL_WAIT_MS = 6 * 60_000;
const MACHINE_CALL_MARGIN_MS = 60_000;

export function machineCallWait(args: unknown) {
  const asked = (args as { timeoutMs?: unknown } | undefined)?.timeoutMs;
  return typeof asked === "number" && asked > 0
    ? asked + MACHINE_CALL_MARGIN_MS
    : MACHINE_CALL_WAIT_MS;
}
