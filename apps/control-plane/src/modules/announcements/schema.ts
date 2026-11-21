import {
  ANNOUNCEMENT_DETAILS_MAX,
  ANNOUNCEMENT_SUMMARY_MAX,
  ANNOUNCEMENT_TEMPLATES,
  ANNOUNCEMENT_TITLE_MAX,
} from "@aven/protocol/announcements";
import { z } from "zod";

const fields = {
  title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX),
  summary: z.string().trim().min(1).max(ANNOUNCEMENT_SUMMARY_MAX),
  details: z.string().trim().max(ANNOUNCEMENT_DETAILS_MAX),
  template: z.enum(ANNOUNCEMENT_TEMPLATES),
  active: z.boolean(),
};

export const createAnnouncementBody = z.object(fields);

export const updateAnnouncementBody = z.object(fields).partial();

export const announcementParams = z.object({ id: z.uuid() });
