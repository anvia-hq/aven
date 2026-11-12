import type { AnnouncementTemplate } from "./types";

export const ANNOUNCEMENT_TEMPLATES: { key: AnnouncementTemplate; label: string }[] = [
  { key: "waves", label: "Waves" },
  { key: "violet", label: "Violet" },
  { key: "pink", label: "Pink" },
  { key: "amber", label: "Amber" },
];

const FILES: Record<AnnouncementTemplate, string> = {
  waves: "waves.jpg",
  violet: "violet.png",
  pink: "pink.png",
  amber: "amber.png",
};

export const templateImage = (template: AnnouncementTemplate) =>
  `/announcements/${FILES[template]}`;

export const templateBackground = (template: AnnouncementTemplate) =>
  `linear-gradient(to right, rgb(0 0 0 / 0.7), rgb(0 0 0 / 0.25)), url(${templateImage(template)})`;
