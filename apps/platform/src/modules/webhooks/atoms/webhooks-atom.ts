import { atom } from "jotai";

import type { Webhook } from "../types";

export const webhooksAtom = atom<Webhook[] | null>(null);
