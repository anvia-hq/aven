export const DRIVING_DAYS_MAX = 30;
export const DRIVING_DAYS_DEFAULT = 7;

const DRIVER = /^\[driver: ([^\]\n]{1,80})\] ([\s\S]*)$/;
const OWN_MARK = "​";

export const driverName = (name: string) =>
  name
    .replace(/[\]\n\r]/g, " ")
    .trim()
    .slice(0, 80) || "Teammate";

export const driverPrompt = (name: string, text: string) => `[driver: ${driverName(name)}] ${text}`;

export const ownPrompt = (text: string) => (DRIVER.test(text) ? `${OWN_MARK}${text}` : text);

export function parseDriverPrompt(prompt: string): { driver?: string; text: string } {
  const match = DRIVER.exec(prompt);
  if (match) return { driver: match[1]!, text: match[2]! };
  return { text: prompt.startsWith(OWN_MARK) ? prompt.slice(OWN_MARK.length) : prompt };
}

export const isDriving = (drivingUntil: string | Date | null | undefined, now = Date.now()) =>
  drivingUntil != null && new Date(drivingUntil).getTime() > now;
