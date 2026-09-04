// SPDX-License-Identifier: GPL-2.0-or-later

import "./styles.css";
import { RuntimeBridge } from "./bridge";
import { I18n } from "./i18n";
import { parseBridgeMessage, MESSAGE_EVENT, PROTOCOL_VERSION, type BridgeMessage } from "./protocol";
import { Obs3dgsRuntime } from "./renderer";

const requiredElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing required element: ${id}`);
  return element as T;
};

const canvas = document.getElementById("viewport");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing required canvas: viewport");

const params = new URLSearchParams(location.search);
const sourceId = params.get("sourceId") ?? "";
const token = params.get("token") ?? "";
const debugEnabled = params.get("debug") === "1" || import.meta.env.DEV;
const bridge = new RuntimeBridge({ sourceId, token });
const elements = {
  canvas,
  status: requiredElement("status"),
  statusTitle: requiredElement("status-title"),
  statusDetail: requiredElement("status-detail"),
  progress: requiredElement("progress"),
  debugPanel: requiredElement("debug-panel"),
  debugTitle: requiredElement("debug-title"),
  debugReady: requiredElement("debug-ready"),
  debugValues: requiredElement("debug-values")
};
let runtime: Obs3dgsRuntime | null = null;
try {
  runtime = new Obs3dgsRuntime({ bridge, debug: debugEnabled, elements });
} catch (error) {
  const locale = params.get("locale") === "zh-CN" || navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
  const i18n = new I18n(locale);
  elements.status.hidden = false;
  elements.statusTitle.textContent = i18n.t("failed");
  elements.statusDetail.textContent = i18n.t("webglUnavailable");
  elements.progress.hidden = true;
  void bridge.send("error", {
    code: "webgl2-unavailable",
    message: error instanceof Error ? error.message.slice(0, 160) : "WebGL2 unavailable",
    recoverable: false
  });
}

const decodeMessage = (detail: unknown): BridgeMessage | null => {
  if (typeof detail !== "string") return parseBridgeMessage(detail);
  try {
    return parseBridgeMessage(JSON.parse(detail));
  } catch {
    return null;
  }
};

window.addEventListener(MESSAGE_EVENT, (event) => {
  const message = decodeMessage((event as CustomEvent<unknown>).detail);
  if (!message || (sourceId && message.sourceId !== sourceId)) return;
  runtime?.acceptMessage(message);
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  runtime?.handleContextLost();
});
canvas.addEventListener("webglcontextrestored", () => runtime?.handleContextRestored());
window.addEventListener("beforeunload", () => runtime?.dispose(), { once: true });
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof Error && event.reason.message === "Worker terminate") event.preventDefault();
});

const initialAsset = params.get("asset");
if (initialAsset) runtime?.loadInitialAsset(initialAsset);

if (debugEnabled) {
  (window as Window & { obs3dgs?: unknown }).obs3dgs = {
    protocolVersion: PROTOCOL_VERSION,
    sourceId,
    snapshot: () => runtime?.debugSnapshot() ?? null,
    startFrameRecording: () => runtime?.startFrameRecording(),
    stopFrameRecording: () => runtime?.stopFrameRecording(),
    send: (message: unknown) => {
      const parsed = parseBridgeMessage(message);
      if (parsed) runtime?.acceptMessage(parsed);
    }
  };
}
