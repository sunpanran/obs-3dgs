// SPDX-License-Identifier: GPL-2.0-or-later

import type { QualityPreset, SourceState } from "./protocol";
import { DEFAULT_STATE, mergeState } from "./protocol";

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, "custom">, Pick<SourceState["output"], "renderScale" | "targetFps"> & Pick<SourceState["scene"], "maxSh"> & Pick<SourceState["quality"], "lodEnabled" | "lodSplatCount">> = {
  performance: {
    renderScale: 0.5,
    targetFps: 30,
    maxSh: 1,
    lodEnabled: true,
    lodSplatCount: 500_000
  },
  balanced: {
    renderScale: 0.75,
    targetFps: 60,
    maxSh: 2,
    lodEnabled: true,
    lodSplatCount: 1_000_000
  },
  quality: {
    renderScale: 1,
    targetFps: 60,
    maxSh: 3,
    lodEnabled: true,
    lodSplatCount: 1_500_000
  }
};

export type LockedAction =
  | "changeAsset"
  | "reloadAsset"
  | "sceneTransform"
  | "camera"
  | "appearance"
  | "quality"
  | "frameAll"
  | "resetCamera"
  | "savePreset"
  | "deletePreset"
  | "interactiveCamera"
  | "applyPreset"
  | "previousPreset"
  | "nextPreset"
  | "presetHotkey"
  | "status";

const LIVE_LOCK_ALLOWED = new Set<LockedAction>([
  "applyPreset",
  "previousPreset",
  "nextPreset",
  "presetHotkey",
  "status"
]);

export const isActionAllowed = (action: LockedAction, liveLock: boolean): boolean =>
  !liveLock || LIVE_LOCK_ALLOWED.has(action);

const finite = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const normalizeDegrees = (value: number): number => {
  if (!Number.isFinite(value) || value === 0) return 0;
  // Avoid tiny numeric changes each time a native camera state is echoed back.
  if (value >= -180 && value < 180) return value;
  let wrapped = value % 360;
  if (wrapped < -180) wrapped += 360;
  else if (wrapped >= 180) wrapped -= 360;
  return wrapped === 0 ? 0 : wrapped;
};

export const applyQualityPreset = (state: SourceState): SourceState => {
  if (state.quality.preset === "custom") return state;
  const preset = QUALITY_PRESETS[state.quality.preset];
  return {
    ...state,
    output: {
      ...state.output,
      renderScale: preset.renderScale,
      targetFps: preset.targetFps
    },
    scene: {
      ...state.scene,
      maxSh: preset.maxSh
    },
    quality: {
      ...state.quality,
      lodEnabled: preset.lodEnabled,
      lodSplatCount: preset.lodSplatCount
    }
  };
};

export const normalizeState = (update: Partial<SourceState>, base = DEFAULT_STATE): SourceState => {
  const mergedInput = mergeState(base, update);
  const oneOf = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? value as T : fallback;
  mergedInput.locale = oneOf(mergedInput.locale, ["en-US", "zh-CN"] as const, base.locale);
  mergedInput.asset.coordinatePreset = oneOf(
    mergedInput.asset.coordinatePreset,
    ["auto", "opengl-y-up", "opencv-x-180", "z-up"] as const,
    base.asset.coordinatePreset
  );
  mergedInput.asset.localUrl = mergedInput.asset.localUrl.length <= 8_192 ? mergedInput.asset.localUrl : base.asset.localUrl;
  mergedInput.asset.fileType = mergedInput.asset.fileType.length <= 32 ? mergedInput.asset.fileType : base.asset.fileType;
  mergedInput.output.background.mode = oneOf(
    mergedInput.output.background.mode,
    ["opaque", "transparent"] as const,
    base.output.background.mode
  );
  mergedInput.display.toneMapping = oneOf(
    mergedInput.display.toneMapping,
    ["none", "linear", "aces"] as const,
    base.display.toneMapping
  );
  mergedInput.quality.preset = oneOf(
    mergedInput.quality.preset,
    ["performance", "balanced", "quality", "custom"] as const,
    base.quality.preset
  );
  const merged = applyQualityPreset(mergedInput);
  const normalizeVec3 = (value: SourceState["scene"]["position"], fallback: SourceState["scene"]["position"]) => ({
    x: finite(value.x, fallback.x),
    y: finite(value.y, fallback.y),
    z: finite(value.z, fallback.z)
  });
  const nearClip = clamp(finite(merged.camera.nearClip, base.camera.nearClip), 0.0001, 1_000_000);
  const farClip = clamp(finite(merged.camera.farClip, base.camera.farClip), nearClip + 0.001, 10_000_000);

  return {
    ...merged,
    settingsSchemaVersion: 1,
    output: {
      ...merged.output,
      width: Math.round(clamp(finite(merged.output.width, base.output.width), 16, 16_384)),
      height: Math.round(clamp(finite(merged.output.height, base.output.height), 16, 16_384)),
      renderScale: clamp(finite(merged.output.renderScale, base.output.renderScale), 0.25, 1),
      targetFps: Math.round(clamp(finite(merged.output.targetFps, base.output.targetFps), 15, 60)),
      background: {
        ...merged.output.background,
        color: {
          r: clamp(finite(merged.output.background.color.r, base.output.background.color.r), 0, 1),
          g: clamp(finite(merged.output.background.color.g, base.output.background.color.g), 0, 1),
          b: clamp(finite(merged.output.background.color.b, base.output.background.color.b), 0, 1)
        }
      }
    },
    scene: {
      ...merged.scene,
      position: normalizeVec3(merged.scene.position, base.scene.position),
      rotationDeg: normalizeVec3(merged.scene.rotationDeg, base.scene.rotationDeg),
      scale: clamp(finite(merged.scene.scale, base.scene.scale), 0.001, 1_000),
      opacity: clamp(finite(merged.scene.opacity, base.scene.opacity), 0, 1),
      recolor: {
        r: clamp(finite(merged.scene.recolor.r, base.scene.recolor.r), 0, 4),
        g: clamp(finite(merged.scene.recolor.g, base.scene.recolor.g), 0, 4),
        b: clamp(finite(merged.scene.recolor.b, base.scene.recolor.b), 0, 4)
      },
      maxSh: Math.round(clamp(finite(merged.scene.maxSh, base.scene.maxSh), 0, 3)) as 0 | 1 | 2 | 3
    },
    camera: {
      ...merged.camera,
      target: normalizeVec3(merged.camera.target, base.camera.target),
      yawDeg: normalizeDegrees(finite(merged.camera.yawDeg, base.camera.yawDeg)),
      pitchDeg: clamp(finite(merged.camera.pitchDeg, base.camera.pitchDeg), -89.5, 89.5),
      rollDeg: normalizeDegrees(finite(merged.camera.rollDeg, base.camera.rollDeg)),
      distance: clamp(finite(merged.camera.distance, base.camera.distance), 0.001, 1_000_000),
      focalLengthMm: clamp(finite(merged.camera.focalLengthMm, base.camera.focalLengthMm), 16, 200),
      filmGaugeMm: 36,
      nearClip,
      farClip
    },
    display: {
      ...merged.display,
      exposure: clamp(finite(merged.display.exposure, base.display.exposure), 0, 16)
    },
    quality: {
      ...merged.quality,
      lodSplatCount: Math.round(clamp(finite(merged.quality.lodSplatCount, base.quality.lodSplatCount), 250_000, 4_000_000))
    }
  };
};
