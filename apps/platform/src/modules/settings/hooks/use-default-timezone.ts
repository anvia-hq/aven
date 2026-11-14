import { useEffect } from "react";

import { postJson } from "@/lib/api";

import { browserTimezone } from "./use-timezone";

export function useDefaultTimezone() {
  useEffect(() => {
    postJson("/preferences/default-timezone", { timezone: browserTimezone() }).catch(() => {});
  }, []);
}
