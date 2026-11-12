export type AnnouncementTemplate = "waves" | "violet" | "pink" | "amber";

export type Announcement = {
  id: string;
  title: string;
  summary: string;
  details: string;
  template: AnnouncementTemplate;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AnnouncementDraft = {
  title: string;
  summary: string;
  details: string;
  template: AnnouncementTemplate;
  active: boolean;
};
