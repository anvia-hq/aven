import { z } from "zod";

export const MAX_VARIABLES = 100;
export const MAX_NAME_LENGTH = 128;
export const MAX_VALUE_LENGTH = 8192;

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
export const nameParams = z.object({ name: variableName });

export const setVariableBody = z
  .object({
    value: z.string().max(MAX_VALUE_LENGTH),
    secret: z.boolean().default(false),
  })
  .refine((body) => !body.secret || body.value.length > 0, {
    message: "A secret needs a value",
    path: ["value"],
  });

export type SetVariableBody = z.infer<typeof setVariableBody>;
