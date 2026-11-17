export type BoatSandbox = {
  id: string;
  state: string;
  dataExpiredAt: string | null;
};

export type BoatSavedSnapshot = {
  name: string;
  status: "saving" | "ready" | "failed";
  error: string | null;
};
