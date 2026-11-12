import { z } from "zod";

export const ANNOUNCEMENT_TEMPLATES = ["waves", "violet", "pink", "amber"] as const;

const fields = {
  title: z.string().trim().min(1).max(60),
  summary: z.string().trim().min(1).max(160),
  details: z.string().trim().max(4000),
  template: z.enum(ANNOUNCEMENT_TEMPLATES),
  active: z.boolean(),
};

export const createAnnouncementBody = z.object(fields);

export const updateAnnouncementBody = z.object(fields).partial();

export const announcementParams = z.object({ id: z.uuid() });
