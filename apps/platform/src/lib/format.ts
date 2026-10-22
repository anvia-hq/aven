import { formatDistanceToNowStrict } from "date-fns";

// "3 hours" or, with `suffix`, "3 hours ago".
export const timeAgo = (iso: string, suffix = false) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: suffix });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
