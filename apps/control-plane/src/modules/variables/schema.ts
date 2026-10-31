import { z } from "zod";

export const MAX_VARIABLES = 100;
export const MAX_NAME_LENGTH = 128;
export const MAX_VALUE_LENGTH = 8192;

// Names the runner or the sandbox rely on: a variable must not change how the sandbox or its
// GitHub sign-in behaves (decision 0045).
const RESERVED = /^(PATH|HOME|USER|SHELL|PWD|LD_.*|AVEN_.*|GH_.*|GITHUB_.*|GIT_.*)$/i;

export const variableName = z
  .string()
  .max(MAX_NAME_LENGTH)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Use letters, digits and underscores, not starting with a digit",
  )
  .refine((name) => !RESERVED.test(name), "This name is reserved");

export const projectParams = z.object({ id: z.uuid() });
export const variableParams = z.object({ id: z.uuid(), name: variableName });

// A variable is made or replaced by name. A secret's value is write-only (decision 0045).
export const setVariableBody = z.object({
  value: z.string().max(MAX_VALUE_LENGTH),
  secret: z.boolean().default(false),
});

export type SetVariableBody = z.infer<typeof setVariableBody>;
