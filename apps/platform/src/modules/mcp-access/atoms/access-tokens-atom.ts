import { atom } from "jotai";

import type { AccessToken } from "../types";

export const accessTokensAtom = atom<AccessToken[] | null>(null);
