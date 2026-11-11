const UPDATE_RUNNER = "Update this computer's runner to use its tools";

export function toolFailureNotice(output: string | undefined): string | undefined {
  if (!output) return undefined;
  if (/unknown call/i.test(output) || output.includes(UPDATE_RUNNER)) return UPDATE_RUNNER;
  return undefined;
}

export function groupFailureNotice(
  tools: readonly { status: string; output?: string }[],
): string | undefined {
  for (const tool of tools) {
    if (tool.status !== "error") continue;
    const notice = toolFailureNotice(tool.output);
    if (notice) return notice;
  }
  return undefined;
}
