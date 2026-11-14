import { BOAT_MACHINE_TYPES, RUNTIME_GITHUB_MODES } from "@aven/protocol/runtime-wire";
import { RUNTIME_NAME_MAX } from "@aven/protocol/runtimes";
import { z } from "zod";

export const runtimeParams = z.object({ id: z.uuid() });

const runtimeName = z.string().trim().min(1).max(RUNTIME_NAME_MAX);

const boatKey = z
  .string()
  .trim()
  .min(8)
  .max(500)
  .refine(
    (key) => key.startsWith("boat_") || key.startsWith("box_"),
    "A boat API key starts with boat_",
  );

export const createRuntimeBody = z.union([
  z.object({
    name: runtimeName,
    provider: z.literal("boat"),
    apiKey: boatKey,
    machineType: z.enum(BOAT_MACHINE_TYPES).optional(),
  }),
  z.object({
    name: runtimeName,
    provider: z.literal("manual").optional(),
  }),
]);

export const renameRuntimeBody = z.object({
  name: z.string().trim().min(1).max(RUNTIME_NAME_MAX),
});

export const githubModeBody = z.object({ githubMode: z.enum(RUNTIME_GITHUB_MODES) });

export type CreateRuntimeBody = z.infer<typeof createRuntimeBody>;

export const updateRuntimeBody = z
  .object({
    release: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
  })
  .optional();

export const foldersQuery = z.object({ path: z.string().max(4096).optional() });

export const createFolderBody = z.object({
  path: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(255),
});
