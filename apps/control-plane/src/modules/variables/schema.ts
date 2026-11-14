import {
  isReservedName,
  MAX_NAME_LENGTH,
  MAX_VALUE_LENGTH,
  VARIABLE_NAME,
} from "@aven/protocol/variables";
import { z } from "zod";

export const variableName = z
  .string()
  .max(MAX_NAME_LENGTH)
  .regex(VARIABLE_NAME, "Use letters, digits and underscores, not starting with a digit")
  .refine((name) => !isReservedName(name), "This name is reserved");

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
