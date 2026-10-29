// noVNC ships no types. This is the part of its API the desktop viewer uses.
declare module "@novnc/novnc" {
  export type RfbOptions = {
    shared?: boolean;
    wsProtocols?: string[];
  };

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: RfbOptions);
    /** Show the desktop but send no keys or pointer events. */
    viewOnly: boolean;
    /** Scale the desktop to fit the element. */
    scaleViewport: boolean;
    /** Ask the server to resize its display to the element; the agent's screen must not change. */
    resizeSession: boolean;
    background: string;
    disconnect(): void;
    focus(): void;
  }
}
