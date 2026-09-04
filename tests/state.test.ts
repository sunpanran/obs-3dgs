import { describe, expect, it } from "vitest";
import { DEFAULT_STATE } from "../src/protocol";
import { applyQualityPreset, isActionAllowed, normalizeDegrees, normalizeState } from "../src/state";

describe("camera angle normalization", () => {
  it.each([[803.45, 83.45], [-803.45, -83.45], [-190, 170], [180, -180],
    [-180, -180], [540, -180], [-540, -180], [720, 0], [-720, 0]])(
    "maps %s degrees to the equivalent native control value %s", (input, expected) => {
      expect(normalizeDegrees(input)).toBeCloseTo(expected, 10);
    }
  );

  it("preserves in-range decimals exactly through repeated camera state round trips", () => {
    const initial = normalizeState({ camera: { ...DEFAULT_STATE.camera, yawDeg: 83.45, rollDeg: -0.1 } });
    let state = initial;
    for (let iteration = 0; iteration < 1000; iteration++) state = normalizeState({ camera: state.camera }, state);
    expect(state.camera).toEqual(initial.camera);
    expect(state.camera.yawDeg).toBe(83.45);
    expect(state.camera.rollDeg).toBe(-0.1);
  });

  it("normalizes a persisted multi-turn yaw and roll while retaining camera position inputs", () => {
    const camera = { ...DEFAULT_STATE.camera, yawDeg: 803.45, rollDeg: -730, distance: 12 };
    const result = normalizeState({ camera }).camera;
    expect(result.yawDeg).toBeCloseTo(83.45, 10);
    expect(result.rollDeg).toBe(-10);
    expect(result.target).toEqual(camera.target);
    expect(result.distance).toBe(12);
    expect(result.focalLengthMm).toBe(camera.focalLengthMm);
  });
});

describe("quality presets", () => {
  it("applies the balanced defaults as one atomic preset", () => {
    const state = applyQualityPreset({
      ...DEFAULT_STATE,
      output: { ...DEFAULT_STATE.output, renderScale: 1, targetFps: 15 },
      scene: { ...DEFAULT_STATE.scene, maxSh: 0 },
      quality: { preset: "balanced", lodEnabled: false, lodSplatCount: 250_000 }
    });
    expect(state.output.renderScale).toBe(0.75);
    expect(state.output.targetFps).toBe(60);
    expect(state.scene.maxSh).toBe(2);
    expect(state.quality.lodSplatCount).toBe(1_000_000);
  });
});

describe("live safety lock", () => {
  it.each([
    "changeAsset",
    "reloadAsset",
    "sceneTransform",
    "camera",
    "appearance",
    "quality",
    "frameAll",
    "resetCamera",
    "savePreset",
    "deletePreset",
    "interactiveCamera"
  ] as const)("blocks %s", (action) => {
    expect(isActionAllowed(action, true)).toBe(false);
  });

  it.each(["applyPreset", "previousPreset", "nextPreset", "presetHotkey", "status"] as const)(
    "allows %s",
    (action) => expect(isActionAllowed(action, true)).toBe(true)
  );
});
