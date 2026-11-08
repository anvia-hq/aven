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
