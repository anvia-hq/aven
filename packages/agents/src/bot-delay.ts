// How long a bot "types" a message before it shows (decision 0058): a person takes longer over a
// long message, within bounds, so a reply of several messages arrives the way a person's would.
export const TYPING_MS_PER_CHAR = 40;
export const TYPING_MIN_MS = 600;
export const TYPING_MAX_MS = 4000;

export const typingDelay = (text: string) =>
  Math.min(
    TYPING_MAX_MS,
    Math.max(TYPING_MIN_MS, Math.round(text.trim().length * TYPING_MS_PER_CHAR)),
  );
