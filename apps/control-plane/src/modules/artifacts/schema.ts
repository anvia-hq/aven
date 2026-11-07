import { ARTIFACT_MEDIA_TYPES, ARTIFACT_NAME } from "@aven/protocol/runtime-wire";
import { z } from "zod";

import { threadParams } from "../threads/schema";
import type { ArtifactContent } from "@aven/protocol/types";

export const artifactParams = threadParams.extend({ name: z.string().regex(ARTIFACT_NAME) });

export const artifactAnswer: z.ZodType<ArtifactContent | null> = z
  .object({
    mediaType: z.enum(ARTIFACT_MEDIA_TYPES),
    data: z.base64(),
  })
  .nullable();
