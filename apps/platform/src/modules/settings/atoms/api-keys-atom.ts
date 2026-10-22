import { atom } from "jotai";

import type { ApiKey } from "../types";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const apiKeysAtom = atom<ApiKey[]>([
  {
    id: "k1",
    name: "CLI (laptop)",
    prefix: "avn_8f2a…c91d",
    createdAt: daysAgo(40),
    lastUsedAt: daysAgo(0),
  },
  { id: "k2", name: "CI", prefix: "avn_31be…07aa", createdAt: daysAgo(12), lastUsedAt: daysAgo(2) },
  {
    id: "k3",
    name: "Old script",
    prefix: "avn_c0de…5e5e",
    createdAt: daysAgo(210),
    lastUsedAt: null,
  },
]);
