export type PairingCode = {
  code: string;
  expiresAt: string;
};

export type ExchangedSession = {
  token: string;
  expiresAt: string;
};

export type PairingClientMeta = {
  ipAddress: string | null;
  userAgent: string | null;
};
