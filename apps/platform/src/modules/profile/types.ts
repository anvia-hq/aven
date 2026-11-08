export type ProfileDay = {
  date: string;
  tokens: number;
};

export type ProfileStats = {
  today: string;
  threads: number;
  longestThreadMs: number;
  currentStreakDays: number;
  longestStreakDays: number;
  tokens: number;
  days: ProfileDay[];
};

export type HeatmapCell = {
  date: string;
  tokens: number;
};

export type HeatmapWeek = {
  label: string | null;
  cells: (HeatmapCell | null)[];
};

export type Point = {
  x: number;
  y: number;
};
