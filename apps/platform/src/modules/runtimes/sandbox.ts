export function isSandbox(
  runtime: { isCloud: boolean; parentRuntimeId: string | null } | undefined,
) {
  return runtime?.isCloud === true || runtime?.parentRuntimeId != null;
}
