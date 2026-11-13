import { useCockpitActivity } from "../hooks/use-cockpit-activity";

export function CockpitActivityNotifier() {
  useCockpitActivity();
  return null;
}
