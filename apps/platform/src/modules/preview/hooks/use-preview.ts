import {
  normalizePreviewPath,
  PREVIEW_BRIDGE_COMMAND_EVENT,
  PREVIEW_BRIDGE_LOCATION_EVENT,
} from "@aven/protocol/preview";
import { useEffect, useRef, useState } from "react";

import { toast } from "@aven/ui/toast";
import { useLocalStorage } from "@aven/ui/use-local-storage";
import { errorMessage, postJson } from "@/lib/api";
import { forgetStoredKeys, registerUserState } from "@/lib/user-state";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

import { addressOf, originOf, parseAddress, parsePort } from "../port";
import type { PreviewAddress, PreviewAnswer, PreviewSession } from "../types";

const PORT_KEY = "aven.preview-port";

registerUserState(() => forgetStoredKeys([PORT_KEY]));

export function usePreview(runtimeId: string) {
  const { config } = usePlatformConfig();
  const previewDomain = config?.previewDomain ?? null;
  const [saved, setSaved] = useLocalStorage(PORT_KEY, "");
  const [port, setPort] = useState(() => {
    const parsed = parsePort(saved);
    return parsed !== null ? addressOf(parsed, { runtimeId, previewDomain }) : saved;
  });
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [problem, setProblem] = useState("");
  const [opening, setOpening] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const editingRef = useRef(false);

  useEffect(() => {
    if (session) return;

    const parsed = parsePort(saved);

    if (parsed !== null) setPort(addressOf(parsed, { runtimeId, previewDomain }));
  }, [previewDomain, runtimeId, saved, session]);

  useEffect(() => {
    if (!session) return;

    const expectedOrigin = originOf(session.port, { runtimeId, previewDomain });

    function onMessage(event: MessageEvent) {
      if (event.origin !== expectedOrigin) return;

      if (event.source !== iframeRef.current?.contentWindow) return;

      const data = event.data as {
        type?: unknown;
        path?: unknown;
        canGoBack?: unknown;
        canGoForward?: unknown;
      } | null;

      if (!data || data.type !== PREVIEW_BRIDGE_LOCATION_EVENT || typeof data.path !== "string") {
        return;
      }

      const nextPath = normalizePreviewPath(data.path);
      setBridgeReady(true);
      setCurrentPath(nextPath);

      if (typeof data.canGoBack === "boolean") setCanGoBack(data.canGoBack);

      if (typeof data.canGoForward === "boolean") setCanGoForward(data.canGoForward);

      if (!editingRef.current) {
        setPort(addressOf(session!.port, { runtimeId, previewDomain }, nextPath));
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [previewDomain, runtimeId, session]);

  function sendCommand(action: "sync" | "back" | "forward" | "reload" | "navigate", path?: string) {
    if (!session) return false;

    const frame = iframeRef.current?.contentWindow;

    if (!frame) return false;

    const targetOrigin = originOf(session.port, { runtimeId, previewDomain });
    const payload = path
      ? { type: PREVIEW_BRIDGE_COMMAND_EVENT, action, path }
      : { type: PREVIEW_BRIDGE_COMMAND_EVENT, action };
    frame.postMessage(payload, targetOrigin);
    return true;
  }

  async function open(target: number, path = "/") {
    const normalizedPath = normalizePreviewPath(path);
    setSaved(String(target));
    setPort(addressOf(target, { runtimeId, previewDomain }, normalizedPath));
    setCurrentPath(normalizedPath);
    setCanGoBack(false);
    setCanGoForward(false);
    setBridgeReady(false);
    setOpening(true);

    try {
      const body =
        normalizedPath === "/" ? { port: target } : { port: target, path: normalizedPath };
      const answer = await postJson<PreviewAnswer>(`/runtimes/${runtimeId}/ports`, body);
      setSession((before) => ({
        ...answer,
        port: target,
        path: normalizedPath,
        key: (before?.key ?? 0) + 1,
      }));
      setProblem("");
    } catch (failure) {
      const message = errorMessage(failure);
      setProblem(message);
      toast.add({ title: "Could not open the preview", description: message, type: "error" });
    } finally {
      setOpening(false);
    }
  }

  function navigateInSession(path: string) {
    if (!session) return;

    const normalizedPath = normalizePreviewPath(path);
    setPort(addressOf(session.port, { runtimeId, previewDomain }, normalizedPath));
    setCurrentPath(normalizedPath);

    if (bridgeReady && sendCommand("navigate", normalizedPath)) return;

    void open(session.port, normalizedPath);
  }

  function reload() {
    if (!session) return;

    void open(session.port, currentPath);
  }

  function goBack() {
    sendCommand("back");
  }

  function goForward() {
    sendCommand("forward");
  }

  function syncLocation() {
    sendCommand("sync");
  }

  function setEditing(editing: boolean) {
    editingRef.current = editing;
  }

  async function openInTab(target: number, path = currentPath) {
    const tab = window.open("about:blank", "_blank");

    if (!tab) {
      toast.add({ title: "Allow pop-ups for Aven to open a preview in a new tab", type: "error" });
      return;
    }

    tab.opener = null;

    try {
      const normalizedPath = normalizePreviewPath(path);
      const body =
        normalizedPath === "/" ? { port: target } : { port: target, path: normalizedPath };
      const answer = await postJson<PreviewAnswer>(`/runtimes/${runtimeId}/ports`, body);
      tab.location.href = answer.url;
    } catch (failure) {
      tab.close();
      toast.add({
        title: "Could not open the preview",
        description: errorMessage(failure),
        type: "error",
      });
    }
  }

  function parseRequestedAddress(): PreviewAddress | null {
    const parsed = parseAddress(port, { runtimeId, previewDomain }, session?.port);

    if (parsed === null) {
      toast.add({
        title: previewDomain
          ? "Enter a port such as 3000 or a preview URL"
          : "Enter an address such as localhost:3000",
        type: "error",
      });
      return null;
    }

    return parsed;
  }

  return {
    port,
    setPort,
    previewDomain,
    session,
    currentPath,
    canGoBack,
    canGoForward,
    problem,
    opening,
    iframeRef,
    open,
    navigateInSession,
    reload,
    goBack,
    goForward,
    syncLocation,
    setEditing,
    openInTab,
    parseRequestedAddress,
  };
}
