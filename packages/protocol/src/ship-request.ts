const OPEN = "<ship_request>";
const CLOSE = "</ship_request>";

/**
 * What Ship sends the agent is wrapped in a tag, so a client can tell it from a message the person
 * typed and draw it as a card. The agent reads the tag too: it is the person asking to ship.
 */
export const wrapShipRequest = (prompt: string) => `${OPEN}\n${prompt}\n${CLOSE}`;

/** The prompt inside a message that `wrapShipRequest` made; null for any other message. */
export function shipRequestOf(text: string) {
  if (!text.startsWith(`${OPEN}\n`) || !text.endsWith(`\n${CLOSE}`)) return null;
  return text.slice(OPEN.length, text.length - CLOSE.length).trim();
}
