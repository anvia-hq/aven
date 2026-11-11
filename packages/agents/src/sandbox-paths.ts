import type { SandboxPaths } from "./types";

export const SANDBOX_PATHS: SandboxPaths = {
  workspace: "/workspace",
  uploads: "/uploads",
  skills: "/skills",
};

const machineSection = ({ workspace, skills }: SandboxPaths) => `<machine>
- You work on the person's own computer, as their user: nothing is fenced around you. The project is ${workspace}; make your changes there, and keep to it. Do not read, change or copy what is outside it (their keys, tokens, dotfiles, other projects) unless the task needs it, and never print a secret.
- Their tools are yours: git, docker, the package managers, the services already running. They are theirs too: do not stop, remove or change anything you did not start.
- Only ${workspace} is yours to change, on the branch this thread works on. Stay on that branch, leave changes you did not make alone, and do not force-push or rewrite history unless the user asks.
- read_file opens text only. To look at a PNG, JPEG, GIF or WebP file (a screenshot you took, a chart, a mockup, an uploaded picture), call view_image with its path.
- read_file and write_file reach ${workspace} only. Anything else, such as ${skills}, is read with exec_command.
- Every command starts in ${workspace}, and so does every process: do not begin one with cd ${workspace}. Use cwd, or cd, only for a subdirectory.
- A command's output, and a file's content, is cut to its last 100,000 characters, with a note at the start saying so. Redirect or filter a command's output when you need the start, and read a long file in pages with startLine and lineCount, fewer lines at a time.
- Ports are the machine's own and may be taken by the person's work or by another thread: pick a free one, and stop the servers and watchers you started when you are done.
</machine>`;

const HOST_WORDS: readonly (readonly [string, string])[] = [
  ["in a sandbox with a project workspace", "on the person's own computer, in a project folder"],
  ["outside the sandbox", "outside the project folder"],
  ["in the sandbox", "on the machine"],
  [
    "a Linux machine with a desktop, a shell and the internet",
    "the person's computer, with a shell and the internet",
  ],
];

export function forPaths(text: string, paths: SandboxPaths) {
  let result = text;
  if (paths.host) {
    result = result.replace(/<sandbox>[\s\S]*?<\/sandbox>/, machineSection(paths));
    for (const [from, to] of HOST_WORDS) result = result.replaceAll(from, to);
  }
  return result.replace(
    /(?<![\w./-])\/(workspace|uploads|skills)(?![\w-])/g,
    (_, name: keyof SandboxPaths) => String(paths[name]),
  );
}
