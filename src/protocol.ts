// SPDX-License-Identifier: GPL-2.0-or-later

export const PROTOCOL_VERSION = 1 as const;
export const MESSAGE_EVENT = "obs3dgs:message" as const;

export type LocaleCode = "en-US" | "zh-CN";
export type CoordinatePreset = "auto" | "opengl-y-up" | "opencv-x-180" | "z-up";
export type BackgroundMode = "opaque" | "transparent";
export type ToneMappingMode = "none" | "linear" | "aces";
export type QualityPreset = "performance" | "balanced" | "quality" | "custom";
export type MessageType = "state" | "command" | "locale" | "visibility";

export interface Vec3Value {
  x: number;
  y: number;
  z: number;
}

export interface ColorValue {
  r: number;
  g: number;
  b: number;
}

export interface SourceState {
  settingsSchemaVersion: 1;
  locale: LocaleCode;
  asset: {
    localUrl: string;
    fileType: string;
    coordinatePreset: CoordinatePreset;
    frameOnLoad: boolean;
  };
  output: {
    width: number;
    height: number;
    renderScale: number;
    targetFps: number;
    background: {
      mode: BackgroundMode;
      color: ColorValue;
    };
  };
  scene: {
    position: Vec3Value;
    rotationDeg: Vec3Value;
    scale: number;
    opacity: number;
    recolor: ColorValue;
    maxSh: 0 | 1 | 2 | 3;
  };
  camera: {
    target: Vec3Value;
    yawDeg: number;
    pitchDeg: number;
    rollDeg: number;
    distance: number;
    focalLengthMm: number;
    filmGaugeMm: 36;
    autoClipping: boolean;
    nearClip: number;
    farClip: number;
  };
  display: {
    toneMapping: ToneMappingMode;
    exposure: number;
  };
  quality: {
    preset: QualityPreset;
    lodEnabled: boolean;
    lodSplatCount: number;
  };
  safety: {
    liveLock: boolean;
  };
}

export interface BridgeMessage {
  protocolVersion: typeof PROTOCOL_VERSION;
  sourceId: string;
  revision: number;
  type: MessageType;
  payload: Partial<SourceState> | Record<string, unknown>;
}

export type RuntimeEventType = "ready" | "progress" | "cameraChanged" | "metrics" | "error";

export interface RuntimeEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  sourceId: string;
  revision: number;
  type: RuntimeEventType;
  payload: Record<string, unknown>;
}

export class RevisionGate {
  private lastRevision = -1;

  accept(revision: number): boolean {
    if (!Number.isSafeInteger(revision) || revision < 0 || revision <= this.lastRevision) return false;
    this.lastRevision = revision;
    return true;
  }

  current(): number {
    return this.lastRevision;
  }
}

export const DEFAULT_STATE: SourceState = {
  settingsSchemaVersion: 1,
  locale: "en-US",
  asset: {
    localUrl: "",
    fileType: "auto",
    coordinatePreset: "auto",
    frameOnLoad: false
  },
  output: {
    width: 1920,
    height: 1080,
    renderScale: 0.75,
    targetFps: 60,
    background: {
      mode: "opaque",
      color: { r: 0, g: 0, b: 0 }
    }
  },
  scene: {
    position: { x: 0, y: 0, z: 0 },
    rotationDeg: { x: 0, y: 0, z: 0 },
    scale: 1,
    opacity: 1,
    recolor: { r: 1, g: 1, b: 1 },
    maxSh: 2
  },
  camera: {
    target: { x: 0, y: 0, z: 0 },
    yawDeg: 35,
    pitchDeg: -12,
    rollDeg: 0,
    distance: 4.2,
    focalLengthMm: 35,
    filmGaugeMm: 36,
    autoClipping: true,
    nearClip: 0.01,
    farClip: 10_000
  },
  display: {
    toneMapping: "none",
    exposure: 1
  },
  quality: {
    preset: "balanced",
    lodEnabled: true,
    lodSplatCount: 1_000_000
  },
  safety: {
    liveLock: false
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergeObject = <T extends Record<string, any>>(base: T, update: Partial<T>): T => {
  const result = { ...base };
  for (const [key, value] of Object.entries(update)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
    const current = result[key];
    if (isObject(current)) {
      if (isObject(value)) result[key as keyof T] = mergeObject(current, value) as T[keyof T];
      continue;
    }
    if (typeof value === typeof current) result[key as keyof T] = value as T[keyof T];
  }
  return result;
};

export const mergeState = (state: SourceState, update: Partial<SourceState>): SourceState =>
  mergeObject(state, update);

export const parseBridgeMessage = (value: unknown): BridgeMessage | null => {
  if (!isObject(value)) return null;
  if (value.protocolVersion !== PROTOCOL_VERSION) return null;
  if (typeof value.sourceId !== "string" || value.sourceId.length > 128) return null;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return null;
  if (typeof value.type !== "string" || !["state", "command", "locale", "visibility"].includes(value.type)) return null;
  if (!isObject(value.payload)) return null;
  return value as unknown as BridgeMessage;
};
