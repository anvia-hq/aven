import { atom } from "jotai";

import type { PreviewOffer } from "../types";

export const previewOfferAtom = atom<PreviewOffer | null>(null);
