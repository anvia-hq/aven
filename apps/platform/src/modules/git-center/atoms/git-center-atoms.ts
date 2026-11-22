import { atom } from "jotai";

import type {
  GitCenterFilters,
  GitCenterInspector,
  GitCenterSnapshot,
  GitCenterTarget,
} from "../types";

export const gitSnapshotsAtom = atom<Record<string, GitCenterSnapshot>>({});

export const gitTargetByProjectAtom = atom<Record<string, GitCenterTarget>>({});

export const gitInspectorByProjectAtom = atom<Record<string, GitCenterInspector>>({});

export const gitFiltersByProjectAtom = atom<Record<string, GitCenterFilters>>({});
