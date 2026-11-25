import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";

import { SHELL_ENDED } from "@aven/protocol/terminal";

import { wsUrl } from "@/lib/api";
import { useTheme } from "@/modules/theme/hooks/use-theme";
import type { Computer } from "@/modules/computer/types";

type TerminalPhase = "connecting" | "connected" | "ended";

const FONT_FAMILY =
  '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const FALLBACK_SIZE = { cols: 80, rows: 24 };

function streamUrl(path: string, size: { cols: number; rows: number }) {
  const { cols, rows } = size;
  return wsUrl(`${path}/terminal/stream?cols=${cols}&rows=${rows}`);
}

function toHex(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");

  if (!context) return color;

  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  const part = (n: number) => n.toString(16).padStart(2, "0");
  return `#${part(r ?? 0)}${part(g ?? 0)}${part(b ?? 0)}`;
}

function cssColor(variable: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return toHex(color);
}

function terminalTheme() {
  const background = cssColor("--background");
  const foreground = cssColor("--foreground");
  const muted = cssColor("--muted-foreground");
  const accent = cssColor("--accent");
  const red = cssColor("--destructive");
  const green = cssColor("--success");
  const yellow = cssColor("--meter");
  const blue = cssColor("--info");
  const magenta = cssColor("--graph-3");
  const cyan = cssColor("--graph-5");
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: accent,
    black: muted,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white: foreground,
    brightBlack: muted,
    brightRed: red,
    brightGreen: green,
    brightYellow: yellow,
    brightBlue: blue,
    brightMagenta: magenta,
    brightCyan: cyan,
    brightWhite: foreground,
  };
}

export function useTerminal({ path }: Computer, onExit: () => void) {
  const target = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const [phase, setPhase] = useState<TerminalPhase>("connecting");
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { resolvedTheme, palette } = useTheme();
  const exited = useRef(onExit);
  exited.current = onExit;

  useEffect(() => {
    const element = target.current;

    if (!element) return;

    setPhase("connecting");
    setReason("");
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 12.5,
      lineHeight: 1.45,
      cursorStyle: "bar",
      cursorBlink: true,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    fit.fit();
    terminal.current = term;

    const ws = new WebSocket(streamUrl(path, term.cols ? term : FALLBACK_SIZE));
    ws.binaryType = "arraybuffer";
    const encoder = new TextEncoder();
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
      if (event.reason === SHELL_ENDED) {
        exited.current();
        return;
      }

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
  }, [path, attempt]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (terminal.current) terminal.current.options.theme = terminalTheme();
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme, palette]);

  return { target, phase, reason, reconnect: () => setAttempt((count) => count + 1) };
}
