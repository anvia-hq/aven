const OPEN = "<ship_request>";
const CLOSE = "</ship_request>";

export const wrapShipRequest = (prompt: string) => `${OPEN}\n${prompt}\n${CLOSE}`;

export function shipRequestOf(text: string) {
  if (!text.startsWith(`${OPEN}\n`) || !text.endsWith(`\n${CLOSE}`)) return null;

  return text.slice(OPEN.length, text.length - CLOSE.length).trim();
}
