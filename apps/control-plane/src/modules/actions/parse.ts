import { z } from "zod";

import type { ParsedActions, ThreadActionBody } from "./types";

export const ACTIONS_FILE = ".aven/actions.yml";
export const MAX_ACTIONS = 12;

const name = z.string().trim().min(1).max(40);

const entry = z
  .object({
    name,
    run: z.string().trim().min(1).max(2000).optional(),
    prompt: z.string().trim().min(1).max(10_000).optional(),
  })
  .strict()
  .refine((value) => (value.run === undefined) !== (value.prompt === undefined), {
    message: "an action has either run or prompt",
  });

const file = z.object({ actions: z.array(entry).max(MAX_ACTIONS) });

export function parseActions(text: string): ParsedActions {
  let document: unknown;
  try {
    document = Bun.YAML.parse(text);
  } catch (error) {
    return { actions: [], problem: error instanceof Error ? error.message : "Not valid YAML" };
  }
  const parsed = file.safeParse(document);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { actions: [], problem: `${issue?.path.join(".") || "file"}: ${issue?.message}` };
  }
  const names = new Set<string>();
  const actions: ThreadActionBody[] = [];
  for (const { name: label, run, prompt } of parsed.data.actions) {
    if (names.has(label)) return { actions: [], problem: `${label} is listed twice` };
    names.add(label);
    actions.push(
      run === undefined
        ? { name: label, kind: "prompt", body: prompt as string }
        : { name: label, kind: "run", body: run },
    );
  }
  return { actions, problem: null };
}
