import type { SearchableFiles } from "../tools/types";

export function localFiles(workdir: string): SearchableFiles {
  return {
    workdir,
    async exec({ command, args = [], cwd }) {
      const child = Bun.spawn([command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).bytes(),
        new Response(child.stderr).bytes(),
        child.exited,
      ]);
      return { status: "exited", exitCode, stdout, stderr, stdoutTruncated: false };
    },
  };
}
