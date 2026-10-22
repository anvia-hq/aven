export type DashboardStats = {
  users: number;
  activeSessions: number;
  signupsLast7Days: number;
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};
