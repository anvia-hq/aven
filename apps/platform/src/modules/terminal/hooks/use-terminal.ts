import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";

import { wsUrl } from "@/lib/api";
import { useTheme } from "@/modules/theme/hooks/use-theme";

export type TerminalPhase = "connecting" | "connected" | "ended";

const FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const FALLBACK_SIZE = { cols: 80, rows: 24 };

function streamUrl(threadId: string, size: { cols: number; rows: number }) {
  const { cols, rows } = size;
  return wsUrl(`/threads/${threadId}/terminal/stream?cols=${cols}&rows=${rows}`);
}

// The page's own colours, resolved to something the terminal can paint: it cannot read `var()`.
function cssColor(variable: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function terminalTheme() {
  const foreground = cssColor("--foreground");
  return {
    background: cssColor("--background"),
    foreground,
    cursor: foreground,
    selectionBackground: cssColor("--accent"),
  };
}

// A shell in the thread's sandbox (decision 0053), drawn by xterm.js. Keystrokes go to the control
// plane as binary messages and the shell's output comes back the same way; a resize is JSON text.
// A shell that ends, or a connection that drops, leaves the screen as it was until `reconnect`
// starts a new shell.
export function useTerminal(threadId: string) {
  const target = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const [phase, setPhase] = useState<TerminalPhase>("connecting");
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { theme } = useTheme();

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    setPhase("connecting");
    setReason("");
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      cursorBlink: true,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    fit.fit();
    terminal.current = term;

    const ws = new WebSocket(streamUrl(threadId, term.cols ? term : FALLBACK_SIZE));
    ws.binaryType = "arraybuffer";
    const encoder = new TextEncoder();
    // Anything typed before the connection opens is dropped, as it would go nowhere.
    const input = term.onData((text) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(text));
    });
    const resized = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols, rows }));
    });
    ws.onopen = () => {
      setPhase("connected");
      term.focus();
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) term.write(new Uint8Array(event.data));
    };
    ws.onclose = (event) => {
      setPhase("ended");
      setReason(event.reason || "The terminal could not be opened");
    };
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(element);

    return () => {
      observer.disconnect();
      input.dispose();
      resized.dispose();
      ws.onclose = null;
      ws.close();
      term.dispose();
      terminal.current = null;
    };
  }, [threadId, attempt]);

  useEffect(() => {
    if (terminal.current) terminal.current.options.theme = terminalTheme();
  }, [theme]);

  return { target, phase, reason, reconnect: () => setAttempt((count) => count + 1) };
}
